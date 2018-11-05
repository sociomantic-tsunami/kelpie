#!/usr/bin/env python3
#
# Boost Software License 1.0 (https://www.boost.org/LICENSE_1_0.txt)
# Copyright (c) 2017-2018 dunnhumby Germany GmbH.
# All rights reserved.
#
# Incremental Diff Server
#
# For POST requests:
#   Reads PullRequest event data from github and extracts the HEAD SHA from it.
#   The SHA is then stored at the <basedir> location using the pattern
#   <owner>/<repo>/<pr-number>
#
#   Only runs for PullRequest actions "synchronize" (when someone pushed new
#   commits) and "opened" (when a new PR has been opened)
#
# For GET requests:
#   Serves the files for <basedir>

import os
import sys
import time
import json
import http.server
import shutil

import hmac
from hashlib import sha1

# Listening Port
PORT = 8000
# Github Secret, optional
SECRET = ""
# Base directory that will be used as root
BASEDIR = "hashes/"

class Handler(http.server.BaseHTTPRequestHandler):

    def checkSecret(self, data):
        header_sig = self.headers.get('X-Hub-Signature')

        if header_sig is None:
            print("Error: No signature found!")
            return False

        sha_name, signature = header_sig.split('=')
        if sha_name != 'sha1':
            print("Error: Unexpected hash algorithm")
            return False

        # HMAC requires the key to be bytes, but data is string
        mac = hmac.new(bytearray(SECRET, 'utf8'), msg=data, digestmod=sha1)

        # What compare_digest provides is protection against timing
        # attacks; we can live without this protection for a web-based
        # application
        if not hmac.compare_digest(str(mac.hexdigest()), str(signature)):
            print("Error: digest mismatch")
            return False

        return True

    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()

        data = self.rfile.read(int(self.headers.get("Content-Length")))

        if len(SECRET) > 0:
            if self.checkSecret(data) == False:
                return

        basedir = BASEDIR

        parsed = json.loads(data.decode("utf-8"))

        if 'action' not in parsed:
            print("No 'action' in payload, skipping...")
            return

        if parsed["action"] not in ("synchronize", "opened"):
            print("Action not one of 'synchronize' or 'opened', skipping...")
            return

        sha = parsed["pull_request"]["head"]["sha"]
        prid = parsed["number"]
        repo = parsed["pull_request"]["base"]["repo"]["full_name"]

        target_path = basedir + "/" + repo

        if os.path.isdir(target_path) == False:
            print("Creating ", target_path)
            os.makedirs(target_path)

        fname = "{}/{}".format(target_path, prid)
        data = "{};{}\n".format(sha, int(time.time()))

        print("Writing {!r} to {!r}...".format(data, fname))

        with open(fname, "a") as f:
            f.write(data)

    def do_GET(self):
        abs_path = os.path.abspath(BASEDIR)
        requested_path = os.path.abspath(BASEDIR + self.path)

        if requested_path.startswith(abs_path) == False:
            print("Error, requested path would lead outside base dir: ", self.path)
            self.send_response(403)
            return

        try:
            with open(requested_path, "rb") as f:
                fs = os.fstat(f.fileno())
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(fs[6]))
                self.end_headers()

                shutil.copyfileobj(f, self.wfile)

        except OSError as err:
            self.send_error(404, "No such file")
            pass

if __name__ == '__main__':
    server_class = http.server.HTTPServer

    httpd = server_class(('', PORT), Handler)
    print("Serving at port", PORT)
    httpd.serve_forever()
