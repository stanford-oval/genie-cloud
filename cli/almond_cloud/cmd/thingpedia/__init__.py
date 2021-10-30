def add_to(subparsers):
    parser = subparsers.add_parser(
        "thingpedia",
        help="Work with thingpedia-common-devices",
    )

    parser.add_children(__name__, __path__)
