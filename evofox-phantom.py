#!/usr/bin/python

##
## Copyright (c) 2020 https://github.com/bojle
##
## Permission is hereby granted, free of charge, to any person obtaining a copy
## of this software and associated documentation files (the "Software"), to
## deal in the Software without restriction, including without limitation the
## rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
## sell copies of the Software, and to permit persons to whom the Software is
## furnished to do so, subject to the following conditions:
##
## The above copyright notice and this permission notice shall be included in
## all copies or substantial portions of the Software.
##
## THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
## IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
## FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
## AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
## LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
## FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
## IN THE SOFTWARE.
##
import argparse
import hid

program_name = "evofox-phantom"
program_desc = "Control LED modes in Amkette Evofox Gaming Mouse"
phantom_vendor_id = "0x18f8"
phantom_product_id = "0x1286"

MODE_BITS = {
    "slow": [0x07, 0x13, 0x7F, 0x10, 0x0F, 0x00, 0x00, 0x00],
    "fast": [0x07, 0x13, 0x7F, 0x13, 0x0F, 0x00, 0x00, 0x00],
    "static": [0x07, 0x13, 0x7F, 0x16, 0x0F, 0x00, 0x00, 0x00],
    "off": [0x07, 0x13, 0x7F, 0x17, 0x0F, 0x00, 0x00, 0x00],
    "on": [0x07, 0x13, 0x7F, 0x16, 0x0F, 0x00, 0x00, 0x00],
}


def format_hex_id(value):
    return f"0x{value:04x}"


def parse_args():
    parser = argparse.ArgumentParser(prog=program_name, description=program_desc)
    parser.add_argument("--vid", default=phantom_vendor_id, help="Vendor ID; lsusb(8)")
    parser.add_argument("--pid", default=phantom_product_id, help="Product ID; lsusb(8)")
    parser.add_argument(
        "-l",
        "--led",
        nargs="?",
        choices=["off", "static", "slow", "fast", "on"],
        default="off",
        help="Set LED mode in CLI mode",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch a graphical interface for connection status and mode switching",
    )
    return parser.parse_args()


def open_device(vid, pid):
    device = hid.device()
    device.open(vid, pid)
    device.set_nonblocking(True)
    return device


def find_mouse_device():
    for device_info in hid.enumerate():
        product = (device_info.get("product_string") or "").lower()
        if "mouse" in product:
            return device_info
    return None


def resolve_device_ids(vid, pid, auto_detect=True):
    if not auto_detect:
        return vid, pid, None

    connected, _ = is_mouse_connected(vid, pid)
    if connected:
        return vid, pid, None

    detected = find_mouse_device()
    if not detected:
        return vid, pid, None

    detected_vid = detected["vendor_id"]
    detected_pid = detected["product_id"]
    if detected_vid == vid and detected_pid == pid:
        return vid, pid, detected

    return detected_vid, detected_pid, detected


def is_mouse_connected(vid, pid):
    try:
        device = open_device(vid, pid)
        device.close()
        return True, "Mouse connected"
    except OSError as err:
        return False, f"Mouse not connected or inaccessible: {err}"


def set_led_mode(vid, pid, mode):
    try:
        write_buf = MODE_BITS[mode]
    except KeyError as err:
        raise ValueError(f"Unsupported mode: {mode}") from err

    try:
        device = open_device(vid, pid)
        device.write(write_buf)
        device.close()
        return True, f"Mode changed to {mode}"
    except OSError as err:
        return False, f"Failed to change mode: {err}"


class MouseControlUI:
    def __init__(self, root, tk_module, ttk_module, vid, pid):
        self.root = root
        self.tk = tk_module
        self.ttk = ttk_module
        self.vid = vid
        self.pid = pid
        self.status_var = tk_module.StringVar(value="Checking mouse connection...")
        self.last_mode_var = tk_module.StringVar(value="No mode sent yet")
        self.device_var = tk_module.StringVar()

        self.root.title("Evofox Phantom Controller")
        self.root.geometry("420x240")
        self.root.resizable(False, False)
        self.root.configure(padx=18, pady=18)

        self.status_label = ttk_module.Label(
            root,
            textvariable=self.status_var,
            font=("TkDefaultFont", 11, "bold"),
        )
        self.status_label.pack(anchor="w", pady=(0, 8))

        ttk_module.Label(root, textvariable=self.device_var).pack(anchor="w", pady=(0, 12))

        button_frame = ttk_module.Frame(root)
        button_frame.pack(fill="x", pady=(0, 12))

        for index, mode in enumerate(("off", "static", "slow", "fast")):
            button = ttk_module.Button(
                button_frame,
                text=mode.capitalize(),
                command=lambda selected_mode=mode: self.apply_mode(selected_mode),
            )
            button.grid(row=index // 2, column=index % 2, padx=6, pady=6, sticky="ew")

        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)

        ttk_module.Button(root, text="Refresh Connection", command=self.refresh_status).pack(
            fill="x", pady=(0, 12)
        )
        ttk_module.Label(root, textvariable=self.last_mode_var).pack(anchor="w")

        self.update_device_label()
        self.refresh_status()
        self.present_window()

    def update_device_label(self):
        self.device_var.set(
            f"VID: {format_hex_id(self.vid)}   PID: {format_hex_id(self.pid)}"
        )

    def present_window(self):
        self.root.update_idletasks()

        width = 420
        height = 240
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        pos_x = max((screen_width - width) // 2, 0)
        pos_y = max((screen_height - height) // 3, 0)

        self.root.geometry(f"{width}x{height}+{pos_x}+{pos_y}")
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(250, lambda: self.root.attributes("-topmost", False))
        try:
            self.root.focus_force()
        except Exception:
            pass

    def refresh_status(self):
        connected, message = is_mouse_connected(self.vid, self.pid)
        self.status_var.set(message)
        self.status_label.configure(foreground="green" if connected else "red")

    def apply_mode(self, mode):
        success, message = set_led_mode(self.vid, self.pid, mode)
        self.last_mode_var.set(message)
        self.refresh_status()
        if success:
            self.status_var.set(f"Mouse connected | Active command: {mode}")
            self.status_label.configure(foreground="green")


def run_gui(vid, pid):
    try:
        import tkinter as tk
        from tkinter import ttk
    except ImportError as err:
        raise SystemExit(
            "Tkinter is required for --gui mode. Install Tk support for Python and try again."
        ) from err

    root = tk.Tk()
    style = ttk.Style(root)
    if "clam" in style.theme_names():
        style.theme_use("clam")
    MouseControlUI(root, tk, ttk, vid, pid)
    root.mainloop()


def main():
    args = parse_args()
    vid = int(args.vid, base=16)
    pid = int(args.pid, base=16)
    auto_detect = args.vid == phantom_vendor_id and args.pid == phantom_product_id
    vid, pid, detected = resolve_device_ids(vid, pid, auto_detect=auto_detect)

    if detected is not None:
        product_name = detected.get("product_string") or "Unknown device"
        print(
            "Auto-detected mouse: "
            f"{product_name} ({format_hex_id(vid)}:{format_hex_id(pid)})"
        )

    if args.gui:
        run_gui(vid, pid)
        return

    success, message = set_led_mode(vid, pid, args.led)
    print(message)
    if not success:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
