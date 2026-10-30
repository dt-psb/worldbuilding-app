import sys
import os
import subprocess
from PIL import Image

def apply_icon(option_num):
    wb_dir = r"X:\WorldBuilding"
    opt_file = os.path.join(wb_dir, f"option{option_num}_*.png")
    # Find matching file
    import glob
    matches = glob.glob(opt_file)
    if not matches:
        print(f"Error: Option {option_num} not found.")
        return False
    
    selected_png = matches[0]
    print(f"Applying: {selected_png}")
    
    img = Image.open(selected_png).convert('RGBA')
    
    # 1. Save icon.png
    dest_png = os.path.join(wb_dir, "icon.png")
    dest_renderer_png = os.path.join(wb_dir, "renderer", "icon.png")
    img.save(dest_png, format='PNG')
    img.save(dest_renderer_png, format='PNG')
    
    # 2. Save icon.ico (multi-size)
    dest_ico = os.path.join(wb_dir, "icon.ico")
    dest_renderer_ico = os.path.join(wb_dir, "renderer", "icon.ico")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(dest_ico, format='ICO', sizes=ico_sizes)
    img.save(dest_renderer_ico, format='ICO', sizes=ico_sizes)
    
    # 3. Recompile WorldBuilding.exe with windres & gcc
    try:
        subprocess.run(["windres", "app.rc", "-O", "coff", "-o", "app_res.o"], cwd=wb_dir, check=True)
        subprocess.run(["gcc", "-O2", "-mwindows", "launcher.c", "app_res.o", "-o", "WorldBuilding.exe"], cwd=wb_dir, check=True)
        if os.path.exists(os.path.join(wb_dir, "app_res.o")):
            os.remove(os.path.join(wb_dir, "app_res.o"))
        print("Successfully recompiled WorldBuilding.exe with new icon!")
    except Exception as e:
        print(f"Compile warning: {e}")
        
    # 4. Refresh shortcut icon
    try:
        ps_cmd = f"""
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("{wb_dir}\\세계관 빌더.lnk")
        $Shortcut.TargetPath = "{wb_dir}\\WorldBuilding.exe"
        $Shortcut.WorkingDirectory = "{wb_dir}"
        $Shortcut.IconLocation = "{dest_ico}, 0"
        $Shortcut.Save()
        """
        subprocess.run(["powershell", "-Command", ps_cmd], check=True)
        print("Shortcut icon refreshed!")
    except Exception as e:
        print(f"Shortcut update warning: {e}")
        
    return True

if __name__ == '__main__':
    num = sys.argv[1] if len(sys.argv) > 1 else '1'
    apply_icon(num)
