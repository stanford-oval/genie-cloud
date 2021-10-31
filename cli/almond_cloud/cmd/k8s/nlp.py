import splatlog as logging

LOG = logging.getLogger(__name__)

NLP_DESC = f"""\
Manage local nlp service.

Can be used to locally hack on STT and TTS endpoints, which normally run on
staging.
"""


def add_parser(subparsers):
    parser = subparsers.add_parser(
        "nlp",
        help=NLP_DESC.splitlines()[0],
        description=NLP_DESC,
    )


# def create
