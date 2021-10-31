def add_parser(subparsers):
    parser = subparsers.add_parser(
        "thingpedia",
        help="Work with thingpedia-common-devices",
    )

    parser.add_children(__name__, __path__)
