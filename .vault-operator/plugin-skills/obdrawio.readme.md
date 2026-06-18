# ObDrawIO

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Obsidian](https://img.shields.io/badge/obsidian-0.15.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)

Edit and manage [draw.io](https://www.diagrams.net/) diagrams (`.drawio` / `.dio` files) directly inside [Obsidian](https://obsidian.md) with a fully functional embedded editor.

## Features

✨ **Full draw.io Editor** — All draw.io features available directly in Obsidian (flowcharts, UML, wireframes, ERD, etc.)

🎨 **Theme Sync** — Automatically matches Obsidian's light/dark theme

💾 **Auto-save** — Changes are automatically saved to your vault as you edit

🔗 **Easy Linking** — Insert diagram links into your notes with a built-in picker

⚙️ **Customizable** — Configure draw.io server URL, theme, language, and more

📱 **Cross-platform** — Works on desktop (tested) and mobile browsers

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open **Settings → Community plugins**
2. Search for "ObDrawIO"
3. Click **Install** and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/hanzhichao/obdrawio/releases)
2. Create folder: `<YourVault>/.obsidian/plugins/obdrawio/`
3. Place the three files in that folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Usage

### Creating a New Diagram

**Option 1: Ribbon Icon**
- Click the workflow icon in the left ribbon

**Option 2: Command Palette**
- Press `Cmd/Ctrl + P` and search for "New diagram"

**Option 3: File Menu**
- Right-click on any folder in the file explorer and select "New diagram"

### Editing Diagrams

- Simply click any `.drawio` or `.dio` file in your vault to open it in the editor
- The editor loads with your current diagram
- Edit freely — changes auto-save by default (configurable in settings)
- Close the tab when done

### Inserting Diagram Links

1. While editing a markdown note, press `Cmd/Ctrl + P`
2. Search for "Insert diagram link into note"
3. Select a diagram from the searchable picker
4. The link `[[diagram-name.drawio]]` is inserted

### Opening in New Tab

- Right-click a `.drawio` file and select "Open in diagram editor"
- Or use Command Palette → "Open diagram in new tab"

## Settings

Access settings via **Settings → Community plugins → ObDrawIO**

| Setting | Default | Description |
|---------|---------|-------------|
| **Draw.io server URL** | `https://embed.diagrams.net` | URL for the editor (use a self-hosted instance for offline use) |
| **Follow Obsidian theme** | ✓ | Auto-switch editor theme when Obsidian theme changes |
| **Auto-save** | ✓ | Automatically save changes as you edit |
| **Default diagram folder** | (vault root) | Folder where new diagrams are created |
| **Language** | (browser default) | Editor language code (e.g., `zh`, `de`, `es`) |

## File Format

`.drawio` files are standard XML-based diagram files compatible with:
- [diagrams.net](https://www.diagrams.net) web editor
- [draw.io desktop](https://github.com/jgraph/drawio-desktop)
- Any draw.io compatible tool

### Supported Extensions

- `.drawio` (standard)
- `.dio` (alternate)

## Tips & Tricks

### Offline Use (Self-Hosted)

1. Set up a [self-hosted draw.io instance](https://github.com/jgraph/docker-draw.io)
2. Update the "Draw.io server URL" setting to point to your instance
3. All editor features remain available without internet

### Language Support

The plugin respects your browser's language settings. To override, set the **Language** setting to:
- `zh` for 中文
- `de` for Deutsch
- `fr` for Français
- `es` for Español
- [See all supported codes](https://github.com/jgraph/draw.io/tree/master/src/main/webapp/locales)

### Linking Diagrams in Notes

After inserting a link like `[[my-diagram.drawio]]`, clicking the link opens the diagram in edit mode. You can also view backlinks in the diagram's own sidebar.

## Keyboard Shortcuts

All draw.io shortcuts work in the editor. Common ones:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + S` | Save (if not auto-saving) |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Y` / `Cmd/Ctrl + Shift + Z` | Redo |
| `Del` / `Backspace` | Delete selected |
| `Cmd/Ctrl + A` | Select all |
| `Cmd/Ctrl + G` | Group |
| `Cmd/Ctrl + Shift + U` | Ungroup |

## Troubleshooting

### Plugin doesn't load after installation

- Ensure `main.js`, `manifest.json`, and `styles.css` are in `<Vault>/.obsidian/plugins/obdrawio/`
- Reload Obsidian: `Cmd/Ctrl + Shift + I` on desktop or close/reopen on mobile
- Check **Settings → Community plugins** that ObDrawIO is enabled

### Editor doesn't respond

- Ensure you have internet access (required for default `embed.diagrams.net`)
- For offline use, configure a self-hosted draw.io URL in settings
- Try reloading the tab or restarting Obsidian

### Changes not saving

- Verify **Auto-save** is enabled in settings
- Manually save with Command Palette → "Open diagram in new tab" and back
- Check that the file permissions allow write access

### Theme not switching

- Ensure **Follow Obsidian theme** is enabled in settings
- Restart the editor tab to force theme refresh

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### Project Structure

```
src/
├── main.ts              # Plugin entry point
├── settings.ts          # Settings UI and defaults
├── types.ts             # TypeScript types and constants
├── view/
│   └── DiagramView.ts   # Main diagram editor view
├── commands/
│   ├── index.ts         # Command registrations
│   └── newDiagram.ts    # "New diagram" modal
└── utils/               # Utility functions
```

## License

MIT License — See [LICENSE](LICENSE) file for details

## Credits

- Built with [Obsidian Plugin API](https://docs.obsidian.md)
- Uses [draw.io](https://www.diagrams.net) by [JGraph](https://github.com/jgraph)
- Icons from Obsidian's built-in icon set

## Feedback & Issues

Found a bug or have a feature request? Please open an [issue](https://github.com/hanzhichao/obdrawio/issues) on GitHub.

## Support

If you find this plugin useful, consider:
- ⭐ Starring the GitHub repository
- 💬 Sharing feedback and suggestions
- 🐛 Reporting bugs with details
- 📝 Contributing improvements via pull requests
