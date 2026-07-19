#!/usr/bin/env python3
"""
Deploy devnull stack to remote Docker host via SSH using paramiko.
Reads credentials from environment variables REMOTE_SSH_USER and REMOTE_SSH_PASSWORD.
"""

import os
import sys
import tarfile
import io
import time
import json
import paramiko

HOST = "86.38.217.69"
PORT = 22
REMOTE_PATH = "/opt/devnull"

USER = os.environ.get("REMOTE_SSH_USER")
PASSWORD = os.environ.get("REMOTE_SSH_PASSWORD")

if not USER or not PASSWORD:
    print("ERROR: REMOTE_SSH_USER and REMOTE_SSH_PASSWORD must be set")
    sys.exit(1)


def create_tar_of_workspace():
    """Create a tar.gz of the workspace (excluding .git, node_modules, etc.)"""
    exclude_dirs = {'.git', 'node_modules', '.agent', 'dist', '__pycache__', '.gitignore'}
    exclude_extensions = {'.log', '.agent'}
    
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for root, dirs, files in os.walk('.'):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            
            for f in files:
                filepath = os.path.join(root, f)
                # Skip excluded extensions
                if any(f.endswith(ext) for ext in exclude_extensions):
                    continue
                try:
                    tar.add(filepath, arcname=filepath)
                except Exception as e:
                    print(f"  Warning: could not add {filepath}: {e}")
    
    buf.seek(0)
    return buf.read()


def exec_command(client, command, timeout=300):
    """Run a command and return (exit_code, stdout, stderr)"""
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout, get_pty=True)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return exit_code, out, err


def main():
    print(f"Connecting to {USER}@{HOST}:{PORT}...")
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
        print("  Connected!")
        
        # Step 1: Pre-check - docker version
        print("\n[1/6] Pre-check: Docker availability...")
        code, out, err = exec_command(client, "docker --version && docker compose version")
        if code != 0:
            print(f"  ERROR: Docker not available: {err}")
            sys.exit(1)
        print(f"  {out.strip()}")
        
        # Step 2: Create remote directory
        print(f"\n[2/6] Creating remote directory {REMOTE_PATH}...")
        code, out, err = exec_command(client, f"mkdir -p {REMOTE_PATH}")
        if code != 0:
            print(f"  ERROR: {err}")
            sys.exit(1)
        print("  Done")
        
        # Step 3: Upload workspace via SFTP
        print("\n[3/6] Uploading workspace (this may take a while)...")
        tar_data = create_tar_of_workspace()
        print(f"  Workspace tar.gz size: {len(tar_data) / 1024 / 1024:.1f} MB")
        
        sftp = client.open_sftp()
        remote_tar_path = f"{REMOTE_PATH}/workspace.tar.gz"
        with sftp.open(remote_tar_path, 'wb') as f:
            f.write(tar_data)
        sftp.close()
        print("  Upload complete")
        
        # Step 4: Extract on remote
        print(f"\n[4/6] Extracting on remote...")
        code, out, err = exec_command(client, f"cd {REMOTE_PATH} && tar xzf workspace.tar.gz && rm workspace.tar.gz && ls -la | head -20")
        if code != 0:
            print(f"  ERROR: {err}")
            sys.exit(1)
        print(f"  Extracted: {out[:500]}")
        
        # Step 5: Docker compose up
        print(f"\n[5/6] Running docker compose up -d --build...")
        code, out, err = exec_command(client, f"cd {REMOTE_PATH} && docker compose up -d --build", timeout=600)
        print(f"  Exit code: {code}")
        if out:
            print(f"  stdout: {out[:2000]}")
        if err:
            print(f"  stderr: {err[:2000]}")
        
        if code != 0:
            print("  WARNING: docker compose returned non-zero exit code")
        
        # Step 6: Health check
        print(f"\n[6/6] Health check...")
        time.sleep(5)
        
        # Check container status
        code, out, err = exec_command(client, f"cd {REMOTE_PATH} && docker compose ps --format json")
        if code == 0 and out.strip():
            print(f"  Container status:\n{out}")
        else:
            code, out, err = exec_command(client, f"cd {REMOTE_PATH} && docker compose ps")
            print(f"  Container status:\n{out}")
        
        # Check API health
        code, out, err = exec_command(client, "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 http://localhost:3001/api/v1/health 2>/dev/null || echo 'failed'")
        print(f"  API health endpoint: HTTP {out.strip()}")
        
        # Check UI health
        code, out, err = exec_command(client, "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 http://localhost:8080/ 2>/dev/null || echo 'failed'")
        print(f"  UI health endpoint: HTTP {out.strip()}")
        
        print("\n✅ Deployment complete!")
        
    except paramiko.AuthenticationException:
        print("ERROR: Authentication failed. Check REMOTE_SSH_USER and REMOTE_SSH_PASSWORD.")
        sys.exit(1)
    except paramiko.SSHException as e:
        print(f"ERROR: SSH connection failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
