# Design

Check `options.signal?.aborted` before constructing or sending a fetch request. Retain the existing one-time abort listener for requests cancelled later. Tests inject a pre-aborted signal and assert the local fetch path is not used.
