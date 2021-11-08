def add_parser(subparsers):
    parser = subparsers.add_parser(
        "nlp",
        help="Muck with local nlp server",
    )

    parser.add_children(__name__, __path__)
