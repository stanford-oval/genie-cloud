def add_to(subparsers):
    parser = subparsers.add_parser(
        "k8s",
        help="Do Kubernetes stuff",
    )

    parser.add_children(__name__, __path__)
