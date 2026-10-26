/// <summary>
/// Keeps the toolkit page up while a plugin is loaded.
///
/// The page, its socket and the link between clients are all
/// <see cref="ToolkitHub"/> now; this only holds it open, so plugins that
/// started a page server before the hub existed still do the right thing.
/// A plugin that registers with the hub does not need one.
/// </summary>
public class WebPageServer
{
    public const int Port = ToolkitHub.Port;

    private bool _started;

    public void Start()
    {
        if (_started)
            return;

        _started = true;
        ToolkitHub.Retain();
    }

    public void Stop()
    {
        if (!_started)
            return;

        _started = false;
        ToolkitHub.Release();
    }
}
