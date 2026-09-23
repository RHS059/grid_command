# Model viewer dimensions and controls

The browser and native viewers read `godot/data/model_dimensions.json`. A scene
unit is one metre. Models scale uniformly from their visible source bounds:
personnel use upright body height; equipment uses its longest dimension. Hidden
deployment parts are excluded, and native deployed trucks retain their stowed
chassis scale. These are viewer transforms; battlefield geometry is unchanged.

Soldiers are nominally 1.80 m tall and commanders 1.85 m. The current imported
bodies are 1.70 m before the preview transform. Weapon fitting belongs to the
personnel equipment assembly, rather than the model size catalog.

HEMTT uses the [Oshkosh M1120A4 length of 10.211 m](https://oshkoshdefense.com/wp-content/uploads/2018/12/17310_HEMTT-A4-LHS_LowRes_4.29.2015.pdf).
The strategic airlifter uses the [USAF C-17 length of 53 m](https://www.amc.af.mil/About-Us/Fact-Sheets/Display/Article/977489/c-17-globemaster-iii/).
The carrier uses the [US Navy Nimitz reference of 332.85 m](https://www.airpac.navy.mil/Organization/Distinguished-Visitor-Info/Important-Links-and-Info/).
The CAS aircraft uses the [Embraer A-29 length of 11.38 m](https://www.embraer.com/media/bwqlipfq/a-29-super-tucano-brochure-english.pdf).
Other entries explicitly record approximate class dimensions or nominal sizes
for the custom/fictional model, rather than claiming exact real vehicle matches.

Gallery cards retain independent thumbnail framing so both a soldier and an
airfield remain selectable. Captions show the physical reference size. Opening a
card restores its metre scale; the camera backs away to frame it. Floor grid
spacing is displayed in metres (1 m for people and most vehicles, larger powers
of ten for ships and compounds).

Click the model canvas to focus controls. WASD translates the camera and its
orbit target; Shift moves faster. Left drag orbits, right/middle drag or Shift
left drag pans, and the wheel zooms. Keyboard input stays inside the focused
preview and clears on focus loss. Escape/X returns to the gallery grid and
preserves scroll position.

