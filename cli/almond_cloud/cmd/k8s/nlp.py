NLP_DESC = f"""\
Manage local nlp service.

Can be used to locally hack on STT and TTS endpoints, which normally run on
staging.
"""


def add_to(subparsers):
    parser = subparsers.add_parser(
        "nlp",
        help=NLP_DESC.splitlines()[0],
        description=NLP_DESC,
    )


# def create
