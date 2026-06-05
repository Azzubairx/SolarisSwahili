# SolarisSwahili — Dynamic Swahili Time System for Libya

SolarisSwahili is a lightweight single-page web application that calculates and displays the dynamic Swahili time based on the user's geographical location and the real movement of the sun, specifically sunrise and sunset. The application is designed to provide a clean, responsive, and modern interface that works directly in the browser without any build step or dependency installation.

The project currently supports major Libyan cities and is structured for easy extension.

## Live Demo

[Open the live website](https://azzubairx.github.io/SolarisSwahili/)

## Features

- Dynamic Swahili time calculation based on actual sunrise and sunset times.
- Relative time logic that divides both day and night into 12 proportional hours.
- Automatic theme switching based on the current solar state.
- Responsive and modern user interface.
- Live time and astronomical data updates.
- Support for multiple Libyan cities.
- Easy expansion for additional cities.
- Zero-build setup with no external installation required.

## Project Structure

```text
SolarisSwahili/
├── index.html        # Main application structure
├── css/
│   └── style.css     # Theme variables, transitions, and custom styling
└── js/
    └── app.js        # Core logic, relative time calculations, and API integration

How It Works

The application relies on real astronomical data to determine:

Sunrise time

Sunset time

The current solar state


Using this data, the app:

1. Calculates the length of the day and night.


2. Divides each period into 12 relative hours.


3. Displays a dynamic Swahili time system that changes according to the sun's actual position.



Automatic Theme System

The theme engine works automatically based on the sun's position in the selected city.

During daylight hours, the light theme is enabled.

After sunset and before sunrise, the application applies the .theme-night class to the <body> element to activate the dark theme smoothly.


Setup

No build tools or package installation are required.

Run Locally

1. Clone the repository:



git clone https://github.com/AzzubairX/SolarisSwahili.git

2. Open index.html in any modern browser.



Technologies Used

HTML5

CSS3

Vanilla JavaScript

Tailwind CSS via CDN

Astronomical time APIs


Supported Cities

Currently, the application supports:

Tobruk

Benghazi

Tripoli


Additional cities can be added easily in future updates.

Design Principles

This project is built to be:

Fast and lightweight

Easy to understand and maintain

Independent of complex frameworks

Based on real astronomical timing data


License

Copyright © 2026 Azzubair

All rights reserved.