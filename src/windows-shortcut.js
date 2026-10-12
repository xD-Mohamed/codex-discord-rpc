// Use the Unicode Shell Link API; WScript.Shell can lose non-ANSI path characters.
export const shortcutType = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class ShellLinkClass {}
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellLinkW {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, IntPtr data, uint flags);
  void GetIDList(out IntPtr id);
  void SetIDList(IntPtr id);
  void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
  void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
  void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
  void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
  void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
  void GetHotkey(out short value);
  void SetHotkey(short value);
  void GetShowCmd(out int value);
  void SetShowCmd(int value);
  void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count, out int index);
  void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
  void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
  void Resolve(IntPtr window, uint flags);
  void SetPath([MarshalAs(UnmanagedType.LPWStr)] string value);
}
public class CodexStartupShortcut {
  readonly IShellLinkW link = (IShellLinkW)new ShellLinkClass();
  public void Load(string file) { ((IPersistFile)link).Load(file, 0); }
  public void Save(string file) { ((IPersistFile)link).Save(file, true); }
  public string Description {
    get { var text = new StringBuilder(1024); link.GetDescription(text, text.Capacity); return text.ToString(); }
    set { link.SetDescription(value); }
  }
  public string TargetPath { set { link.SetPath(value); } }
  public string Arguments { set { link.SetArguments(value); } }
  public string WorkingDirectory { set { link.SetWorkingDirectory(value); } }
  public int WindowStyle { set { link.SetShowCmd(value); } }
}
'@
`;
