from textwrap import dedent

from kubernetes import client, config
from clavier import log as logging

from almond_cloud.config import CONFIG

LOG = logging.getLogger(__name__)

DESC = f"""\
Start a REPL with a `kubernetes.client.CoreV1Api` loaded up as `api_v1`.

`CONFIG` is also available. Readline and tab-completion are hooked up too.

You can use this to bang-around the Kubernetes Python API. Useful when writing
new commands.
"""


def add_to(subparsers):
    parser = subparsers.add_parser(
        "repl",
        target=repl,
        help=DESC.splitlines()[0],
        description=DESC,
    )


def repl():
    import code

    config.load_kube_config()
    api_v1 = client.CoreV1Api()
    console = code.InteractiveConsole(locals={**globals(), **locals()})

    # https://stackoverflow.com/a/35116399
    console.push("import readline")
    console.push("from rlcompleter import Completer")
    console.push("""readline.parse_and_bind("tab: complete")""")
    console.push("readline.set_completer(Completer(locals()).complete)")

    console.interact()
