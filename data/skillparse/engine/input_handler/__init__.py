from abc import ABC, abstractmethod


class Annotation(ABC):
    """Abstract base for all annotations. Each handler defines
    its own subclass with concrete fields."""

    @abstractmethod
    def to_dict(self) -> dict:
        ...

    @classmethod
    @abstractmethod
    def from_dict(cls, data: dict) -> "Annotation":
        ...


class InputHandler(ABC):
    @abstractmethod
    def __init__(self, **kwargs):
        ...

    @property
    @abstractmethod
    def annotation_class(self) -> type[Annotation]:
        """The concrete Annotation subclass this handler produces."""
        ...

    @abstractmethod
    def read(self, path) -> Annotation:
        ...
