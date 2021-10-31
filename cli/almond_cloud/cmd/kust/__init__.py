def add_parser(subparsers):
    parser = subparsers.add_parser(
        "kust",
        help="Do Kustomize stuff",
    )

    parser.add_children(__name__, __path__)
