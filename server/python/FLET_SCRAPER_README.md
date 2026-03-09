# Melhor Casa - Flet GUI Scraper

A standalone Python desktop application for web scraping real estate listings with a graphical interface.

## Features

- **Graphical User Interface** - User-friendly desktop app built with Flet
- **Multi-site Support** - Scrape from 9+ real estate websites simultaneously
- **Advanced Filtering** - Filter by price, size, rooms, parking spaces, bathrooms
- **Location Search** - Search by city and neighborhood
- **Property Management** - Like/dislike properties, manage favorites
- **Excel Export** - Export scraped data to Excel spreadsheets
- **Real-time Updates** - See results as they're found

## System Requirements

- Python 3.8 or higher
- Firefox or Chrome browser (required for web scraping)
- 500MB disk space minimum

## Installation

### 1. Install Python Dependencies

```bash
# Core dependencies for scraping
pip install -r requirements.txt

# For Excel export functionality (optional but recommended)
pip install openpyxl

# Flet for GUI
pip install flet

# Web scraping
pip install selenium
```

### 2. Install WebDriver

The scraper uses Selenium with Firefox. You need to install Firefox and geckodriver.

**On Windows:**
```bash
# Option 1: Download from https://github.com/mozilla/geckodriver/releases
# Place geckodriver.exe in your PATH or project directory

# Option 2: Use chocolatey
choco install firefox geckodriver
```

**On macOS:**
```bash
brew install firefox geckodriver
```

**On Linux:**
```bash
sudo apt-get install firefox-geckodriver
# or
sudo apt-get install firefox
# Download geckodriver from https://github.com/mozilla/geckodriver/releases
```

### 3. Verify Installation

```bash
python flet_scraper_gui.py --help
```

## Usage

### Starting the Application

```bash
# From the server/python directory
python flet_scraper_gui.py

# Or from the project root
python server/python/flet_scraper_gui.py
```

The GUI will open in your default browser automatically.

### How to Use

1. **Select Websites** - Check the boxes for the websites you want to scrape:
   - Netimóveis
   - Casa Mineira
   - Imóvel Web
   - Zap Imóveis
   - Viva Real
   - OLX
   - Quinto Andar
   - Loft
   - Chaves na Mão

2. **Set Location** - Enter the city and optionally the neighborhood

3. **Select Property Type** - Choose between apartments, houses, garages, etc.

4. **Set Filters** (Optional):
   - **Price Range** - Minimum and maximum price in R$
   - **Area** - Minimum and maximum in m²
   - **Rooms** - Comma-separated list (e.g., "2,3,4+")
   - **Parking Spaces** - Comma-separated list (e.g., "1,2,3+")
   - **Bathrooms** - Comma-separated list (e.g., "1,2,3+")

5. **Start Scraping** - Click "Iniciar Scraping" button

6. **Manage Results**:
   - ❤️ Like properties to save them
   - 👎 Dislike properties to exclude them
   - Click "Abrir link" to view the listing

7. **Export Data** - Click "Exportar Excel" to save all results to an Excel file

## Keyboard Shortcuts

- `Ctrl+L` - Focus on location input
- `Ctrl+S` - Start scraping
- `Ctrl+X` - Export to Excel

## Configuration

### Environment Variables

```bash
# Set custom Python binary for scraper
export PYTHON_BIN=/usr/bin/python3

# Set custom Firefox path
export FIREFOX_BIN=/usr/bin/firefox
```

### Advanced Options

You can modify `flet_scraper_gui.py` to:
- Change default location
- Add more websites
- Customize GUI colors and layout
- Add new filters

## Troubleshooting

### "Firefox not found" Error
- Install Firefox: https://www.mozilla.org/firefox/
- Or set `FIREFOX_BIN` environment variable to your Firefox installation

### "geckodriver not found" Error
- Download from: https://github.com/mozilla/geckodriver/releases
- Add to PATH or place in project root

### Slow Scraping
- Reduce the number of selected websites
- Run with more specific filters (city/neighborhood)
- Close other browser windows to free up resources

### Excel Export Fails
- Install openpyxl: `pip install openpyxl`
- Ensure write permissions in the application directory

### GUI Not Appearing
- Try running with: `python -m flet flet_scraper_gui.py`
- Update flet: `pip install --upgrade flet`

## Performance Tips

1. **Use Specific Filters** - More specific searches complete faster
2. **Limit Websites** - Scraping fewer sites reduces load time
3. **Set Area Limits** - Narrow down the area search
4. **Run on SSD** - Faster disk I/O helps with large exports

## Data Storage

Scraped data is stored in memory while the application is running. To keep your data:
1. Export to Excel using the "Exportar Excel" button
2. Or manually save properties by liking them

## Comparing with Web Version

| Feature | Web (React) | Desktop (Flet) |
|---------|-----------|----------------|
| Multi-user | ✅ | ❌ |
| Ranking | ✅ | ❌ |
| Savings Goals | ✅ | ❌ |
| Cloud Sync | ✅ | ❌ |
| Export | ✅ | ✅ |
| Offline Use | ❌ | ✅ |
| No Server Needed | ❌ | ✅ |

## License

This project is part of the Melhor Casa initiative.

## Support

For issues or feature requests, please refer to the main project documentation.
