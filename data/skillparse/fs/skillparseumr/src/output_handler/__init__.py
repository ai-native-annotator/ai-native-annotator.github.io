import os
from abc import ABC, abstractmethod


class OutputHandler(ABC):
    """Turns a Runner's worktree into the skillset's output format."""

    suffix = ""                 # file extension of the output, e.g. ".umr"

    @abstractmethod
    def render(self, annotation, worktree) -> str:
        ...

    def write(self, annotation, worktree, path):
        """render() to a file. Returns the path."""
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.render(annotation, worktree))
        return path
