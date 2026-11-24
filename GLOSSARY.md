# Swiss Free Flight

A web app for Swiss paraglider and hang glider pilots: flying sites, airspace hazards, live weather and soaring forecasts, built on the public data behind the official SHV FSVL app. The UI language is German first; the English term below is the canonical one in code and docs, the German one is what pilots see.

## Flying sites

**Flying site** (Fluggebiet):
A place an association or club has registered for free flight, made up of one or more take-offs, landings and their auxiliary areas.
_Avoid_: Flugplatz, spot, area

**Take-off** (Startplatz):
The point of a flying site where pilots launch, with the wind directions it can be used in.
_Avoid_: Launch site, start, launch (except as the data's type value)

**Landing** (Landeplatz):
The point of a flying site where pilots land.
_Avoid_: Landing site, landing zone, LZ

**Landing circuit** (Landevolte):
The prescribed approach pattern flown before a landing.
_Avoid_: Landing pattern (except as the data's `landingpattern` type), Volte, approach

**Site fee** (Start- und Landegebühr):
The charge a club levies for using a take-off or landing.
_Avoid_: Landing fee, Gebühr

## Airspace and hazards

**Airspace** (Luftraum):
A volume of controlled or restricted air (CTR, TMA, glider sector, danger or restricted area) with lower and upper limits.
_Avoid_: Zone, sector

**Obstacle** (Luftfahrthindernis):
A registered aviation obstacle such as a power line, cable car, mast or crane, published by BAZL.
_Avoid_: Hindernis (alone), hazard

**Wildlife reserve** (Wildschutzgebiet):
A protected area for wildlife (Wildruhezone or Jagdbanngebiet) with a minimum flying height or a seasonal ban.
_Avoid_: Wildschutz zone, sanctuary

**Glider chart** (Segelflugkarte):
BAZL's 1:350,000 aeronautical chart for gliding, updated yearly, shown as one of the map's base maps.
_Avoid_: Soaring map, ICAO chart

**DABS**:
The Daily Airspace Bulletin Switzerland, listing the day's temporary airspace restrictions.
_Avoid_: NOTAM bulletin, airspace bulletin

## Weather

**Station** (Messstation):
A ground weather station reporting live measurements such as wind, gusts, temperature and pressure.
_Avoid_: Wind station, sensor

**Measurement** (Messwert):
One reported value from a station at a point in time.
_Avoid_: Observation, reading

**Station pair** (Stationspaar):
Two stations whose difference in pressure or temperature indicates föhn, bise or stability across a ridge.
_Avoid_: Transect, Alpentransekt

**Pressure difference** (Druckdifferenz):
The sea-level pressure difference across a station pair, in hPa; the Gotthard pair (Lugano minus Kloten) is the main föhn indicator.
_Avoid_: Delta p, pressure gradient

**Föhn**:
A warm, gusty downslope wind across the Alps, south föhn or north föhn, dangerous for free flight.
_Avoid_: Foehn wind (in UI text)

**Webcam**:
A live camera image from a mountain or flying site.
_Avoid_: Cam

## Forecasts

**Text forecast** (Textprognose):
The written daily forecast bulletins: regional, paragliding (Gleitschirmprognose), soaring (Segelflugprognose) and the general situation.
_Avoid_: Bulletin, Wetterbericht

**Outlook** (Aussichten):
The multi-day map animation of sunshine and precipitation probability over Switzerland.
_Avoid_: Days overview, forecast map

**Isobar chart** (Isobarenkarte):
The synoptic surface pressure chart for Europe.
_Avoid_: Pressure map, Wetterkarte

**Sounding station** (Previtemps-Standort):
One of the fixed locations for which a forecast sounding is shown.
_Avoid_: Previtemps station (except in data and file names), sounding location

**Sounding** (Emagramm):
A forecast vertical profile of temperature, dew point and wind above a sounding station, drawn as an emagram.
_Avoid_: Emagram (as the data), Skew-T, profile

**Lapse rate**:
How fast temperature changes with height, in degrees per 100 m; it colours the sounding to show thermal strength and inversions.
_Avoid_: Gradient

## Pilots

**Member** (Mitglied):
A pilot registered with SHV FSVL, who can sign in with an SHV login.
_Avoid_: User, account

**Brevet**:
A pilot licence rating held by a member, such as paraglider or tandem.
_Avoid_: License, rating (alone)

**Logbook** (Flugbuch):
The pilot's own list of flights, kept on their device.
_Avoid_: Flight log, Flugliste
