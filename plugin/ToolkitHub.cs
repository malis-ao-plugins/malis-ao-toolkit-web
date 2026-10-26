using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using AOSharp.Common.GameData;
using AOSharp.Core;
using AOSharp.Core.UI;

/// <summary>
/// One connection between the toolkit page and every injected client.
///
/// Each client loads this library once, however many toolkit plugins it runs.
/// The first client to take port 7067 is the host: it serves the page there,
/// the page's socket (/ws), and a socket the other clients join as peers
/// (/peer). Every other client is a peer. If the host goes away, the next
/// client to take the port becomes host and the rest join it.
///
/// Every message names its app and its client (the character), so the page
/// keeps each client's state apart and can talk to one client at a time:
///
///   plugin → page   { app, client, name, ...payload }
///   page → plugin   { app, client, ...payload }
///
/// Messages between the hub's own ends carry "hub" instead of "app".
///
/// The hub also reports this client's game window, as app "$window": whether
/// it is in front, minimized, and its game area in physical screen pixels
/// (AOSharp Core's GameWindow). The overlay sits on whichever client is in
/// front, and the page switches to that client's tabs.
/// </summary>
public static class ToolkitHub
{
    public const int Port = 7067;

    /// <summary>The pseudo-app the game window's state travels as.</summary>
    public const string WindowApp = "$window";

    private const string ResourcePrefix = "www/";

    private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".txt"] = "text/plain; charset=utf-8",
        [".ico"] = "image/x-icon",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".svg"] = "image/svg+xml",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
        [".mp3"] = "audio/mpeg",
        [".wav"] = "audio/wav",
    };

    private static readonly Assembly Assembly = typeof(ToolkitHub).Assembly;

    // Request path ("static/js/main.js") to resource name. MSBuild writes the
    // folder part of the name with backslashes.
    private static readonly Dictionary<string, string> Files = Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith(ResourcePrefix))
        .ToDictionary(n => n[ResourcePrefix.Length..].Replace('\\', '/'), n => n, StringComparer.OrdinalIgnoreCase);

    private static readonly object Gate = new();
    private static readonly ConcurrentDictionary<string, ToolkitApp> Apps = new();
    private static readonly ConcurrentQueue<string> Notices = new();

    private static int _users;
    private static CancellationTokenSource? _cts;
    private static Task? _loop;

    private static int _client;
    private static string _name = "";

    // Host side.
    private static readonly ConcurrentDictionary<Connection, byte> Pages = new();
    private static readonly ConcurrentDictionary<int, Peer> Peers = new();

    // Peer side: the link to the host, and how many pages the host has.
    private static Connection? _host;
    private static volatile int _remotePages;
    private static volatile bool _isHost;

    /// <summary>Whether any page is open on any client's host.</summary>
    public static bool HasPages => _isHost ? !Pages.IsEmpty : _remotePages > 0;

    /// <summary>This client's character id, as the page knows it.</summary>
    public static int Client => _client;

    /// <summary>
    /// A plugin's end of the hub, named by the app id the page uses
    /// (for example "app_7069"). Dispose it in Teardown.
    /// </summary>
    public static ToolkitApp Register(string appId)
    {
        var app = new ToolkitApp(appId);
        Apps[appId] = app;
        Retain();
        SendHello();
        return app;
    }

    internal static void Unregister(ToolkitApp app)
    {
        if (Apps.TryRemove(new KeyValuePair<string, ToolkitApp>(app.Id, app)))
        {
            SendHello();
            Release();
        }
    }

    /// <summary>Keeps the hub running; every Retain is paired with a Release.</summary>
    internal static void Retain()
    {
        lock (Gate)
        {
            if (_users++ > 0)
                return;

            // The game thread, where the character is known.
            var player = DynelManager.LocalPlayer;
            _client = player?.Identity.Instance ?? Game.ClientInst;
            _name = player?.Name ?? $"Client {_client}";

            Game.OnUpdate += OnUpdate;
            GameWindow.Changed += OnGameWindowChanged;
            _cts = new CancellationTokenSource();
            _loop = Task.Run(() => RunAsync(_cts.Token));
        }
    }

    internal static void Release()
    {
        Task? loop;
        lock (Gate)
        {
            if (--_users > 0)
                return;

            Game.OnUpdate -= OnUpdate;
            GameWindow.Changed -= OnGameWindowChanged;
            _cts?.Cancel();
            loop = _loop;
            _loop = null;
        }

        // Before the plugin context unloads, nothing of ours may still run.
        try { loop?.Wait(2000); } catch { }
    }

    // ── Sending ──────────────────────────────────────────────────────────────

    /// <summary>A plugin's message on its way to the page.</summary>
    internal static void Send(string appId, string json)
    {
        string message = Stamp(json, appId);

        if (_isHost)
        {
            foreach (var page in Pages.Keys)
                page.Send(message);
        }
        else
        {
            _host?.Send(message);
        }
    }

    /// <summary>
    /// Adds app, client and name to a plugin's JSON object. Spliced rather than
    /// parsed: the dungeon map sends one every frame.
    /// </summary>
    private static string Stamp(string json, string appId)
    {
        string body = json.Trim();
        if (!body.StartsWith('{'))
            return body;

        string rest = body[1..].TrimStart();
        string head = $"{{\"app\":{JsonSerializer.Serialize(appId)},\"client\":{_client},\"name\":{JsonSerializer.Serialize(_name)}";
        return rest.StartsWith('}') ? head + rest : head + "," + rest;
    }

    private static void SendHello()
    {
        if (_isHost)
        {
            BroadcastClients();
            return;
        }

        _host?.Send(Hello());
    }

    private static string Hello() => JsonSerializer.Serialize(new
    {
        hub = "hello",
        client = _client,
        name = _name,
        apps = Apps.Keys.ToArray(),
    });

    private static void BroadcastClients()
    {
        var clients = new List<object> { new { client = _client, name = _name, apps = Apps.Keys.ToArray() } };
        clients.AddRange(Peers.Values.Select(p => new { client = p.Client, name = p.Name, apps = p.Apps }));
        string message = JsonSerializer.Serialize(new { hub = "clients", clients });

        foreach (var page in Pages.Keys)
            page.Send(message);
    }

    private static void BroadcastPageCount()
    {
        string message = JsonSerializer.Serialize(new { hub = "pages", count = Pages.Count });
        foreach (var peer in Peers.Values)
            peer.Connection.Send(message);
    }

    // ── Receiving ────────────────────────────────────────────────────────────

    /// <summary>A message for an app on this client.</summary>
    private static void Dispatch(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            if (!root.TryGetProperty("app", out var app) || !Apps.TryGetValue(app.GetString() ?? "", out var target))
                return;

            target.Handle(root);
        }
        catch (Exception ex)
        {
            Notices.Enqueue($"Toolkit: bad message from the page: {ex.Message}");
        }
    }

    private static void PageConnected()
    {
        SendWindow();
        foreach (var app in Apps.Values)
            app.RaisePageConnected();
    }

    private static void OnGameWindowChanged(object? sender, EventArgs e) => SendWindow();

    /// <summary>The game window as the page and the overlay want it.</summary>
    private static void SendWindow()
    {
        var bounds = GameWindow.ClientBounds;
        Send(WindowApp, JsonSerializer.Serialize(new
        {
            type = "window",
            foreground = GameWindow.IsForeground,
            minimized = GameWindow.IsMinimized,
            bounds = new { x = bounds.X, y = bounds.Y, width = bounds.Width, height = bounds.Height },
        }));
    }

    /// <summary>Host: a message from a page goes to the client it names.</summary>
    private static void FromPage(string text)
    {
        int client;
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("client", out var c) || !c.TryGetInt32(out client))
                return;
        }
        catch
        {
            return;
        }

        if (client == _client)
            Dispatch(text);
        else if (Peers.TryGetValue(client, out var peer))
            peer.Connection.Send(text);
    }

    /// <summary>Host: a message from a peer is either for the hub or for the pages.</summary>
    private static Peer? FromPeer(Connection connection, Peer? peer, string text)
    {
        if (text.Contains("\"hub\""))
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            if (root.TryGetProperty("hub", out var hub) && hub.GetString() == "hello")
            {
                bool first = peer == null;
                peer = new Peer(
                    root.GetProperty("client").GetInt32(),
                    root.GetProperty("name").GetString() ?? "",
                    root.GetProperty("apps").EnumerateArray().Select(a => a.GetString() ?? "").ToArray(),
                    connection);
                Peers[peer.Client] = peer;
                BroadcastClients();

                // A client that joins while a page is open has to send that page
                // what it has, as it would on a page connecting.
                if (first)
                {
                    connection.Send(JsonSerializer.Serialize(new { hub = "pages", count = Pages.Count }));
                    if (!Pages.IsEmpty)
                        connection.Send(JsonSerializer.Serialize(new { hub = "pageConnected" }));
                }
                return peer;
            }
        }

        foreach (var page in Pages.Keys)
            page.Send(text);
        return peer;
    }

    /// <summary>Peer: a message from the host is either for the hub or for an app here.</summary>
    private static void FromHost(string text)
    {
        if (!text.Contains("\"hub\""))
        {
            Dispatch(text);
            return;
        }

        using var doc = JsonDocument.Parse(text);
        var root = doc.RootElement;
        if (!root.TryGetProperty("hub", out var hub))
        {
            Dispatch(text);
            return;
        }

        switch (hub.GetString())
        {
            case "pages":
                _remotePages = root.GetProperty("count").GetInt32();
                break;
            case "pageConnected":
                PageConnected();
                break;
        }
    }

    // ── The loop: host if the port is free, peer if it is not ───────────────

    private static async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var listener = new HttpListener();
            listener.Prefixes.Add($"http://localhost:{Port}/");

            bool hosting;
            try
            {
                listener.Start();
                hosting = true;
            }
            catch (HttpListenerException)
            {
                listener.Close();
                hosting = false;
            }

            try
            {
                if (hosting)
                    await HostAsync(listener, token);
                else
                    await JoinAsync(token);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                Notices.Enqueue($"Toolkit: {ex.Message}");
            }

            // Lost the host, or could not reach one yet: try again shortly.
            try { await Task.Delay(1000, token); } catch (OperationCanceledException) { }
        }
    }

    private static async Task HostAsync(HttpListener listener, CancellationToken token)
    {
        _isHost = true;
        _host = null;
        using var stop = token.Register(() => { try { listener.Stop(); listener.Close(); } catch { } });

        if (Files.ContainsKey("index.html"))
        {
            // [Open] shows an info window whose link runs /start, which opens the page
            // in the browser; the same form the AOSetups exporter uses for its links.
            var url = $"http://localhost:{Port}";
            Notices.Enqueue($"Toolkit page: {url} <a href=\"text://<a href='chatcmd:///start {url}'>Open the toolkit page</a>\">[Open]</a>");
        }

        try
        {
            while (!token.IsCancellationRequested)
            {
                var ctx = await listener.GetContextAsync();
                var path = ctx.Request.Url?.AbsolutePath ?? "/";

                if (ctx.Request.IsWebSocketRequest && path == "/ws")
                    _ = Task.Run(() => ServePageAsync(ctx, token));
                else if (ctx.Request.IsWebSocketRequest && path == "/peer")
                    _ = Task.Run(() => ServePeerAsync(ctx, token));
                else
                    _ = Task.Run(() => ServeFile(ctx));
            }
        }
        catch (HttpListenerException) { }
        catch (ObjectDisposedException) { }
        finally
        {
            _isHost = false;
            foreach (var page in Pages.Keys)
                page.Close();
            foreach (var peer in Peers.Values)
                peer.Connection.Close();
            Pages.Clear();
            Peers.Clear();
        }
    }

    private static async Task ServePageAsync(HttpListenerContext ctx, CancellationToken token)
    {
        var socket = (await ctx.AcceptWebSocketAsync(null)).WebSocket;
        var page = new Connection(socket, token);
        Pages[page] = 0;

        BroadcastClients();
        BroadcastPageCount();
        PageConnected();
        foreach (var peer in Peers.Values)
            peer.Connection.Send(JsonSerializer.Serialize(new { hub = "pageConnected" }));

        await page.ReceiveAsync(FromPage);

        Pages.TryRemove(page, out _);
        page.Close();
        BroadcastPageCount();
    }

    private static async Task ServePeerAsync(HttpListenerContext ctx, CancellationToken token)
    {
        var socket = (await ctx.AcceptWebSocketAsync(null)).WebSocket;
        var connection = new Connection(socket, token);
        Peer? peer = null;

        await connection.ReceiveAsync(text => peer = FromPeer(connection, peer, text));

        if (peer != null && Peers.TryGetValue(peer.Client, out var current) && current.Connection == connection)
        {
            Peers.TryRemove(peer.Client, out _);
            BroadcastClients();
        }
        connection.Close();
    }

    private static async Task JoinAsync(CancellationToken token)
    {
        using var socket = new ClientWebSocket();
        await socket.ConnectAsync(new Uri($"ws://localhost:{Port}/peer"), token);

        var host = new Connection(socket, token);
        _host = host;
        _remotePages = 0;
        host.Send(Hello());

        try
        {
            await host.ReceiveAsync(FromHost);
        }
        finally
        {
            _host = null;
            _remotePages = 0;
            host.Close();
        }
    }

    private static void ServeFile(HttpListenerContext ctx)
    {
        var res = ctx.Response;
        try
        {
            var path = Uri.UnescapeDataString(ctx.Request.Url?.AbsolutePath ?? "/").TrimStart('/');

            // The app has one page; anything that isn't a file gets it.
            if (!Files.ContainsKey(path) && Path.GetExtension(path) == "")
                path = "index.html";

            if (!Files.TryGetValue(path, out var resource))
            {
                res.StatusCode = 404;
                return;
            }

            using var stream = Assembly.GetManifestResourceStream(resource)!;
            res.ContentType = ContentTypes.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream");
            if (path == "index.html")
                res.AddHeader("Cache-Control", "no-cache");
            res.ContentLength64 = stream.Length;
            stream.CopyTo(res.OutputStream);
        }
        catch
        {
            try { res.StatusCode = 500; } catch { }
        }
        finally
        {
            try { res.Close(); } catch { }
        }
    }

    // The game client only tolerates chat from its own thread.
    private static void OnUpdate(object? sender, float deltaTime)
    {
        while (Notices.TryDequeue(out var notice))
            Chat.WriteLine(notice, ChatColor.LightBlue);
    }

    private sealed record Peer(int Client, string Name, string[] Apps, Connection Connection);

    /// <summary>
    /// A socket with one writer. A WebSocket takes one send at a time, and the
    /// game thread must never wait on one, so sends are queued. A page that
    /// falls behind loses the oldest messages, not the game's frame rate.
    /// </summary>
    private sealed class Connection
    {
        private readonly WebSocket _socket;
        private readonly CancellationToken _token;
        private readonly Channel<string> _outbox = Channel.CreateBounded<string>(
            new BoundedChannelOptions(512) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

        public Connection(WebSocket socket, CancellationToken token)
        {
            _socket = socket;
            _token = token;
            _ = Task.Run(PumpAsync);
        }

        public void Send(string text) => _outbox.Writer.TryWrite(text);

        public void Close()
        {
            _outbox.Writer.TryComplete();
            try { _socket.Abort(); } catch { }
        }

        private async Task PumpAsync()
        {
            try
            {
                await foreach (var text in _outbox.Reader.ReadAllAsync(_token))
                {
                    if (_socket.State != WebSocketState.Open)
                        break;
                    await _socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, _token);
                }
            }
            catch { }
        }

        /// <summary>Hands each text message to <paramref name="onMessage"/> until the socket closes.</summary>
        public async Task ReceiveAsync(Action<string> onMessage)
        {
            var buffer = new byte[16 * 1024];
            using var message = new MemoryStream();

            try
            {
                while (_socket.State == WebSocketState.Open && !_token.IsCancellationRequested)
                {
                    var result = await _socket.ReceiveAsync(buffer, _token);
                    if (result.MessageType == WebSocketMessageType.Close)
                        break;

                    message.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage)
                        continue;

                    string text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                    message.SetLength(0);

                    try { onMessage(text); }
                    catch (Exception ex) { Notices.Enqueue($"Toolkit: {ex.Message}"); }
                }
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { }
        }
    }
}

/// <summary>A plugin's end of <see cref="ToolkitHub"/>.</summary>
public sealed class ToolkitApp : IDisposable
{
    private readonly ConcurrentDictionary<string, Action<JsonElement>> _handlers = new();
    private int _disposed;

    internal ToolkitApp(string id) => Id = id;

    public string Id { get; }

    /// <summary>
    /// Raised off the game thread when a page connects, or when this client
    /// joins a host that has one open: send the page what you have.
    /// </summary>
    public event Action? PageConnected;

    /// <summary>Whether any page is open, on whichever client is host.</summary>
    public bool HasPages => ToolkitHub.HasPages;

    /// <summary>
    /// Handles one message type from the page. Runs off the game thread, so a
    /// handler should only record what was asked and act on the next frame.
    /// </summary>
    public void Register(string messageType, Action<JsonElement> handler) => _handlers[messageType] = handler;

    /// <summary>Sends a JSON object to the page; app, client and name are added.</summary>
    public void Send(string json) => ToolkitHub.Send(Id, json);

    internal void Handle(JsonElement root)
    {
        if (root.TryGetProperty("type", out var type) && _handlers.TryGetValue(type.GetString() ?? "", out var handler))
            handler(root);
    }

    internal void RaisePageConnected() => PageConnected?.Invoke();

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 0)
            ToolkitHub.Unregister(this);
    }
}
