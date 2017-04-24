This is a userscript intended to be used with greasemonkey or tampermonkey.

It enriches the github pull request page with so called 'incremental diffs'.
This means that you will get a diff for changes pushed to that pull request,
showing the difference before and after the push.

This is particular useful for situations where the reviewee was asked to do some
changes in their existing commits (not additional commits). The reviewer can
then use this to see those changes directly, not having to go through all the
commits again, making sure the requested changes were addressed.

All this works by using github webhook, an external server and this script.

User Setup
==========

A working installation of greasemoneky or tampermonkey is required.

To install the script, just follow this `link <https://raw.githubusercontent.com/sociomantic-tsunami/kelpie/master/incremental-pr-diffs.user.js>`_.

After navigating to any pull request page, the script will ask you to setup a
personalized access token for github so it can access the github API.

The hash data url is optional and not required for the normal user. If you do
need it, your repository admin should have told you about it.

You can change your configuration settings later anytime by clicking on
the ``Incremental Diffs Setup`` button at the bottom of the right sidebar.
This also tells you whether the userscript is properly loaded.

The rest of this README talks about how to set things up for the repository
admin and can savely be ignored by the user.

Bootstrapping
=============

Server & Repo configuration
~~~~~~~~~~~~~~~~~~~~~~~~~~~

You will need to setup a server that will receive github webhook calls and that
will provide the recorded hashes for each push to a pull request.

We're providing a simple python based server that handles the bare minimum.
More complex solutions are probably desired.

You can find it at ``server-scripts/simple-incremental-diff-server.py``. When you open
the file you can configure the port, secret and base dir where the hashes are
stored.

Then just run the file using ``./simple-incremental-diff-server.py``.

To make the userscript aware of the URL of where to fetch the hashes, you can
enter your URL in the configuration when setting setting up the script
(the hash data url mentioned in the user setup section). Note that you have to
tell this URL to every user that should also benefit from the userscript.

Alternatively, you setup the URL inside the repository so that other people using
the userscript automatically use the correct url.

For that, do the following in the repository:

  .. code:: sh

    URLSHA=$(echo "https://<your-url>" | git hash-object --stdin -w)
    git update-ref refs/meta/incremental-diff-url $URLSHA
    git push origin refs/meta/incremental-diff-url

This will create a special git reference that points to a git object that
contains the URL. The userscript will automatically query repositories for that
reference and use it if it exists. It will fallback to the URL specified in the
setup otherwise.
Note that this is a bit hacky as references are usually expected to point to git
commit objects, not git text objects. However, we're also using a namespace
separate from the usual references, namely ``refs/meta`` to avoid it being
used in normal interactions.

Github Configuration
~~~~~~~~~~~~~~~~~~~~

This part describes how to configure the github side of things to call our
simple python server

Every repository needs to have a webhook installed:

1. Head over to the Settings page of your repository
2. Find the "Webhooks" subpage.
3. Click the "Add webhook" button
4. Enter your webhook server URL: `https://<your-url>/`
5. Select the Content Type "application/json"
6. Enter the secret you previously set in the server variables
7. Select the option to send pull request events to the webhook server
