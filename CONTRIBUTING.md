# Contributing to vscode-cisco-config-highlight

Thank you for your interest in contributing to this project! We welcome contributions from the community. Please follow the guidelines below to ensure a smooth collaboration.


## Development Setup

```bash
# Install dependencies
npm ci
```


## Building the Extension

## Launching the Extension in VS Code

1. Set up the development environment by opening the project in VS Code.
2. Press `F5` to launch a new Extension Development Host instance of VS Code with the extension loaded.

### Build and install locally

1. Build the extension
```bash
# Build the extension
npm run package
```

2. Install the generated `.vsix` file in VS Code
outputs a `.vsix` file in the root directory. You can install this file in VS Code by opening the command palette (Ctrl+Shift+P), selecting "Extensions: Install from VSIX...", and choosing the generated `.vsix` file.


## Running Tests

```bash
# Run unit tests
npm run test

# Extension host tests (requires VS Code)
npm run test:vscode
```

Refer to the test commands in the `package.json` scripts section.


## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check and auto-fix
npm run check:fix
```


## Ways to Contribute

We welcome and appreciate any form of contributions:

### Bug Report or Issue

Report bugs, unexpected behavior, performance issues, and edge cases that are not handled correctly.


### New Syntax Highlighting Rules or Improvements

Suggest new Cisco syntax highlighting rules, improvements to existing rules, or support for additional configuration commands and platforms.


### Feature Requests

Suggest improvements to extension behavior, usability, diagnostics, outline support, or other functionality beyond syntax highlighting.


### Documentation or Translation Contributions

Improve documentation, fix typos, clarify explanations, or add and maintain translations.


### Testing and Feedback

Share test results, usage feedback, and reports about real-world configurations that help improve the extension.


## How to Submit

- Use the [GitHub repository](https://github.com/Y-Ysss/vscode-cisco-config-highlight) for issues, discussions, and pull requests.
- Use the **Bug Report or Issue** template for bugs.
- Use the **New Syntax Request** template for syntax highlighting requests.
- Use the **Feature Request** template for non-syntax feature ideas.
- Open a Discussion when you want to share feedback or discuss an idea before implementation.
- If you already have an implementation, link the related issue in your Pull Request.


## Pull Requests

- Link your PR to the related issue.
- Run `npm run check:fix` and `npm run test:unit` before submitting.
- Keep each PR focused on a single concern.


## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

