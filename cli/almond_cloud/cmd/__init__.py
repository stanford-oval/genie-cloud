from clavier import dyn

def add_to(subparsers):
    for module in dyn.children_modules(__name__, __path__):
        if hasattr(module, "add_to"):
            module.add_to(subparsers)
