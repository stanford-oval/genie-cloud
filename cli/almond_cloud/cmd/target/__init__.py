def add_parser(subparsers):
    parser = subparsers.add_parser(
        "target",
        help="Work with deployment targets",
    )

    parser.add_children(__name__, __path__)
