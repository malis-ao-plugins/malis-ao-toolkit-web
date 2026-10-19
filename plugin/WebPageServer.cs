using System.Net;
using System.Reflection;
using AOSharp.Common.GameData;
using AOSharp.Core;
using AOSharp.Core.UI;

/// <summary>
/// Serves the toolkit page (the built web app, embedded in this DLL from www/)
/// on one fixed port, so a browser can open it with no npm running.
///
/// Every toolkit plugin starts one. Whichever starts first takes the port; the
/// others keep retrying, so the page stays up while any of them is loaded.
/// </summary>
public class WebPageServer
{
    public const int Port = 7067;

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

    private readonly Dictionary<string, string> _files;
    private readonly Assembly _assembly = typeof(WebPageServer).Assembly;
    private readonly CancellationTokenSource _cts = new();
    private HttpListener? _listener;
    private Task? _task;

    // The server runs off the game thread, and the game client only tolerates chat from its own
    // thread, so the address is written on the next game frame once the port is taken.
    private volatile bool _announce;

    public WebPageServer()
    {
        // Request path ("static/js/main.js") to resource name. MSBuild writes
        // the folder part of the name with backslashes.
        _files = _assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith(ResourcePrefix))
            .ToDictionary(n => n[ResourcePrefix.Length..].Replace('\\', '/'), n => n, StringComparer.OrdinalIgnoreCase);
    }

    public void Start()
    {
        if (!_files.ContainsKey("index.html"))
        {
            Chat.WriteLine("Toolkit page: no page built into this DLL.");
            return;
        }

        Game.OnUpdate += OnUpdate;
        _task = Task.Run(RunAsync);
    }

    public void Stop()
    {
        Game.OnUpdate -= OnUpdate;
        _cts.Cancel();
        try { _listener?.Stop(); _listener?.Close(); } catch { }
        try { _task?.Wait(1000); } catch { }
    }

    private void OnUpdate(object? sender, float deltaTime)
    {
        if (!_announce)
            return;

        _announce = false;
        Chat.WriteLine($"Toolkit page: http://localhost:{Port}", ChatColor.LightBlue);
    }

    private async Task RunAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            var listener = new HttpListener();
            listener.Prefixes.Add($"http://localhost:{Port}/");

            try
            {
                listener.Start();
            }
            catch (HttpListenerException)
            {
                // Another plugin has the port. Try again in case it goes away.
                listener.Close();
                try { await Task.Delay(3000, _cts.Token); } catch (OperationCanceledException) { return; }
                continue;
            }

            _listener = listener;
            if (_cts.IsCancellationRequested)
            {
                listener.Close();
                return;
            }

            _announce = true;

            try
            {
                while (true)
                {
                    var ctx = await listener.GetContextAsync();
                    _ = Task.Run(() => Serve(ctx));
                }
            }
            catch (HttpListenerException) { }
            catch (ObjectDisposedException) { }
            return;
        }
    }

    private void Serve(HttpListenerContext ctx)
    {
        var res = ctx.Response;
        try
        {
            var path = Uri.UnescapeDataString(ctx.Request.Url?.AbsolutePath ?? "/").TrimStart('/');

            // The app has one page; anything that isn't a file gets it.
            if (!_files.ContainsKey(path) && Path.GetExtension(path) == "")
                path = "index.html";

            if (!_files.TryGetValue(path, out var resource))
            {
                res.StatusCode = 404;
                return;
            }

            using var stream = _assembly.GetManifestResourceStream(resource)!;
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
}
