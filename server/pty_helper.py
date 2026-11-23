#!/usr/bin/env python3
"""Run a program on a pseudo-terminal and relay it over stdin/stdout.

Kernel Path Workbench uses this instead of a compiled Node module, so the app
needs nothing built on your machine: Python 3 ships with Fedora.

    pty_helper.py CWD PROGRAM [ARGS...]

Output: whatever the program writes to the terminal, as raw bytes on stdout.
Input: frames on stdin, each [1-byte type][4-byte big-endian length][payload]
    b"D"  bytes to type into the terminal
    b"R"  resize: rows, cols as two big-endian 16-bit numbers
The exit status is the program's own.
"""
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time


def set_size(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def hang_up(pid, fd, sig):
    """Signal the shell's process group and whatever is running in the
    foreground (make, vim, a program you ran), not just the shell."""
    groups = set()
    try:
        groups.add(os.getpgid(pid))
    except OSError:
        pass
    try:
        groups.add(os.tcgetpgrp(fd))
    except OSError:
        pass
    for g in groups:
        try:
            os.killpg(g, sig)
        except OSError:
            pass
    try:
        os.kill(pid, sig)
    except OSError:
        pass


def write_all(fd, data):
    while data:
        try:
            n = os.write(fd, data)
        except BlockingIOError:
            select.select([], [fd], [])
            continue
        data = data[n:]


def main():
    if len(sys.argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    cwd, argv = sys.argv[1], sys.argv[2:]

    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.chdir(cwd)
        except OSError:
            os.chdir(os.path.expanduser("~"))
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLORTERM"] = "truecolor"
        os.environ.pop("ELECTRON_RUN_AS_NODE", None)
        try:
            os.execvp(argv[0], argv)
        except OSError as e:
            sys.stderr.write(f"{argv[0]}: {e.strerror}\n")
            os._exit(127)

    set_size(fd, 24, 80)
    stdin = sys.stdin.buffer.fileno()
    out = sys.stdout.buffer
    pending = b""
    stdin_open = True
    hung_up_at = None
    while True:
        rlist = [fd] + ([stdin] if stdin_open else [])
        if hung_up_at is not None and time.monotonic() - hung_up_at > 2:
            hang_up(pid, fd, signal.SIGKILL)     # it ignored the hang-up
            hung_up_at = None
        try:
            ready, _, _ = select.select(rlist, [], [], 0.5 if hung_up_at is not None else None)
        except InterruptedError:
            continue
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError:            # EIO: the program closed the terminal
                data = b""
            if not data:
                break
            out.write(data)
            out.flush()
        if stdin_open and stdin in ready:
            chunk = os.read(stdin, 65536)
            if not chunk:              # the tab was closed: hang up, like closing a terminal window
                stdin_open = False
                hang_up(pid, fd, signal.SIGHUP)
                hung_up_at = time.monotonic()
                continue
            pending += chunk
            while len(pending) >= 5:
                kind = pending[:1]
                size = struct.unpack(">I", pending[1:5])[0]
                if len(pending) < 5 + size:
                    break
                payload, pending = pending[5:5 + size], pending[5 + size:]
                if kind == b"D":
                    write_all(fd, payload)
                elif kind == b"R" and size == 4:
                    rows, cols = struct.unpack(">HH", payload)
                    set_size(fd, max(rows, 1), max(cols, 1))

    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    return 128 + os.WTERMSIG(status) if os.WIFSIGNALED(status) else 1


if __name__ == "__main__":
    sys.exit(main())
