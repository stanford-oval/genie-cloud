def add_to(subparsers):
    parser = subparsers.add_parser(
        "image",
        help="Docker image",
    )

    parser.add_children(__name__, __path__)
