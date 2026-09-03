# Requirements

## Security Hardening & Local Bundling

### Scenario: Segment-aware path containment
- **WHEN** any artifact or file path is queried
- **THEN** `isPathContained` SHALL use `path.relative` to strictly ensure the target resides within the workspace root
- **AND** it SHALL reject prefix-sibling directories, parent traversal `..`, and cross-drive absolute paths.

### Scenario: Localhost binding and CORS restriction
- **WHEN** the dashboard server starts
- **THEN** it SHALL bind strictly to `127.0.0.1`
- **AND** it SHALL NOT emit `Access-Control-Allow-Origin: *` headers.

### Scenario: Zero-CDN offline execution
- **WHEN** the dashboard web UI is accessed
- **THEN** it SHALL render and operate completely offline without loading any external CDN scripts or stylesheets from the Internet.
