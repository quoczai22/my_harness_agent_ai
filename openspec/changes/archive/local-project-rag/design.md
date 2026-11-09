# Design

Index safe text files locally with deterministic lexical search first: exact path/symbol/token matches score above similar token overlap. On each chat request, retrieve a bounded set of relevant snippets from only the opened workspace and prepend them as local context. Exclude secrets, ignored folders, binaries, and system/session messages.
