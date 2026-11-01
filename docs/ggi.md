# The .GGI file: the objects' geometry

`/HIRO/HIRO.GGI` is the one file of its kind on the disc, 310,376 bytes, and it holds the meshes of everything the game draws in 3D that is not a block: the ball, every object a level places, and the things that move, each in its own colours, and after them the sprites and the lettering the game draws flat.

The PAL disc's file is 309,592 bytes and the Japanese disc's 317,364, each laid out as the US file is, its thirteen header words in the same places, the same seven sections, both model tables at the same bytes and 105 models, and what each changes is read off it below: the PAL file one model, the jump's arc, the HUD's icons, the title and the copyright notice, the Japanese file six models and the lettering of the menus and the HUD.

It is loaded once at startup rather than per world, which is why the objects look the same in every world while the blocks change.

`tools/kula_ggi.py` reads all of it.

`tools/kula_build.py` writes what the viewer draws to `public/objects.json`: for every type some level places and that has a mesh, its models at full detail, one per variant, as vertices per frame, polygons, a colour per corner and the flags, with `sorted` on a model the game draws by depth, `blend` on one with translucent polygons and `normals` on the balls, in the game's units with a block 512 across.

For the PAL and Japanese discs `tools/kula_build.py` writes, through `tools/kula_ggi.py`, the whole model list of every type whose models are not `public/objects.json`'s and the jump's arc where it is not, under `objects` in the disc's release file, which the viewer reads in place of the base's for the types and the arc it carries, so a disc's things are drawn with its own models ([viewer.md](viewer.md)).

The types that move are keyed by their type numbers from the first table, on the reading below, and the fourteen balls come after, for the start.

```bash
python3 tools/kula_ggi.py --sections
python3 tools/kula_ggi.py --tables                 # both model tables, and every model's shape
python3 tools/kula_ggi.py --sheet                  # out/ggi/models.png, every model in its colours
python3 tools/kula_ggi.py --textures               # out/ggi/textures.png, every sprite and glyph
python3 tools/kula_ggi.py --release jp --overlay   # which types and whether the arc the Japanese disc's file changes, and the overlay's size, as JSON
```

## How it was found

The filename is built at `0x8004ccf8` from a world index, an extension index into the table of five at `0x80073504` (`.TGI`, `.SFX`, `.PAK`, `.GGI`, `FI.PAK`) and a destination.

`0x80040144` calls it with extension 3 and destination `0x80106000`, the buffer the `.SFX` has just been read from and consumed, and `0x80040154` hands that address to `0x80022de0`, which is the parser.

The level packs and the artwork are loaded later and per world; this one is not.

## Settled

**A 13-word header, then seven sections laid end to end from byte 52.** Words 6 to 12 are the sections' sizes in `u16`, and the seventh boundary lands on the file's end exactly: S0 191,496 bytes, S1 1,920, S2 8,192, S3 8,192, S4 12, S5 204, S6 100,308.

The PAL file's sections are the same sizes but S5 at 172 bytes and S6 at 99,556, the Japanese file's but S0 at 188,916 and S6 at 109,876, and S1 to S4 are the same bytes on all three.

Words 13 and 14 (8 and 408) place two tables inside S0, at bytes 60 and 460.

Words 0 to 5 (10, 7, 10, 44, 32, 13) are summed cumulatively by the parser into 10, 17, 27, 71, 103 and 116 and kept; what they bound is not read.

Words 15 to 17 repeat the second table's length, 3,600.

**Two model tables, each of `u32` offsets from its own start**, `-1` for absent. The first has 25 entries of four words; the second 50 models of four rows of four words, and the routine at `0x80023258` indexes it as `[model][row][slot]` with strides 64, 16 and 4. That the offsets are relative to the table they sit in, not to the section, is what made the first table's models readable: relative to the section they landed in the middle of the ball.

**In the second table the model index is the object type.** Type 5 holds the teleporter, 7 the exit, 9 the switch, 10 the boost button, 11 the moving spikes, 12 the spikes, 26 the hidden exit, 28 the arrow, 31 the key, 32 and 33 the two pills, 35 the hourglass, 36 the gem, 37 the coin, 38 the sunglasses and 43 to 47 the five fruit, apple, watermelon, pumpkin, bananas and strawberry, in the order they come round in play.

A row is a level of detail, three of them where the model has any and the fourth row unused, and a slot is the variant the type's varying field picks: four teleporters and four switches for the four circuit colours, three gems that are three different cuts, three coins, two exits for red and green.

Types 34 and 42, which only the object catalogue places, are a third pill, a flat tablet, and two hedgehogs, a brown one and a green one.

Types with no model of their own, 1, 2, 8, 29 and 30, are the ones drawn on the block's face or not at all: fire, ice, the clock, the start on a clock and the start, the last two where the ball is, for which the viewer draws the world's ball.

Types 39 to 41 and 48 to 49 all point at the arrow, which reads as a placeholder.

On the PAL disc the arrow, the one model that file changes, is the same fourteen points moved 40 units along the way it points, its top cut into another quad and triangle over the same colours.

The draw of a thing on a block reaches its model through the table as it stands (`0x8002d878`): word `type × 16 + row × 4 + f3`, the row 2 where the thing's depth passes the farther of the two distances at 292 and 296 of the struct `0x800a5764` points at, 1 where it passes the nearer and 0 otherwise, so a far thing draws a coarser model.

The fruit a level shows is not the one its type names: the loader rewrites it to the first of the five not yet collected ([motion.md](motion.md)), so LEVEL 1's fruit is type 46, the bananas, where play shows an apple, and on the arcade levels each numbered level shows the next of the five round, which is how the map draws them.

**The first table holds fourteen balls and the things that move.** Entries 0 to 13 are spheres of radius 100, most of 98 vertices and one of 140, each entry naming the same model three times over.

The game picks among them at `0x80035ff4`: the world's place for an arcade level, so the ball is thematic, world 0, Hiro, white with coloured panels and world 3, Arctic, white and red; for a bonus level one of entries 10 to 12, by a counter the start routine steps at every level start since the game was switched on (`0x8003601c`), restarts included, so which one a player meets depends on the path they took; for a hidden level, which the code numbers mode 2, entry 13, a glass shell of 180 translucent polygons with three shards inside, green, yellow and red, drawn from the same mesh; and in the Japanese release whatever the ball designer chose.

The Japanese file holds the same fourteen balls byte for byte, its first table's entries 3 to 12 naming the US file's 4, 5, 7, 8, 10, 11, 12, 3, 6 and 9, and the map draws the US order on every disc until which ball a world shows there is settled (below).

The viewer takes the world's ball, the glass one for a level the hidden flag marks, and for a level with no key one of the three, in the order of the bonus slots where the level stands in one and the first elsewhere; entries 20 to 24 are a three-pointed star, the wheel at three levels of detail, a four-pointed star, the hexagonal ball and the corkscrew at three levels: types 50, 51, 52, 53 and 56, the thinner star with three points being type 50 and the fuller one with four type 52, which play settled.

The parser runs `0x80023258` at load over model 36's three rows and three slots, the gem's three cuts at each level of detail, and builds a 348-byte record from each of the nine, which is the only call of that routine and is what makes the gems glint ([motion.md](motion.md)); the ball's draw and the captivators' draws reach their models through the first table by the same two distances (`0x8002cd78`, `0x8002c7d8`).

**A model** is a header and three or four blocks:

- `i16 x, z, y` of the model's centre, `u16` bounding radius, an `i16` whose two low bits are the blend its translucent polygons take (-1, 0 or 3), `u16` flags that say how its polygons are drawn (0, 1 or 2, below), then `u32` block offsets, the first of which is 24 or 28 and so says how many there are.
- Polygons: four `u8` vertex indices each, as many as the texture block has records.
- Vertices: `u32 frames, u32 bytes per frame`, then per frame three vertices to a 20-byte group, `x1 z1 x2 z2 x3 z3 y1 y2 y3 pad` as `i16`, unused slots holding `-1`. Y is up. Every model has one frame except the moving spikes, which have 32.
- Colours: `u32 1, u32 bytes`, then 16 bytes per polygon, four corners of `r, g, b, flags`, the flags on the first corner only: `0x20` always, `0x10` for a Gouraud polygon, `0x08` for a quad, `0x02` for a translucent one. The byte is the command the GPU draws the polygon by, which the renderer hands on as it stands, and its bit 0, which would take a texture raw, is set on no polygon; the lowest bit of the first corner's red says whether the polygon is culled where it faces away (below). That these are colours and not texture coordinates is what the coins say: tier 0 is `(201, 157, 78)`, gold, tier 1 `(79, 157, 201)`, blue, tier 2 `(173, 86, 0)`, bronze; the four teleporters' panels are `(255, 255, 0)`, `(0, 0, 255)`, `(0, 255, 0)` and `(255, 0, 0)`; the exit's two variants are green and red, the lethargy pill red and yellow and the bouncy pill purple and pink, as they look in play. The shading is baked in, a teleporter's grey body running from 38 to 167 by face.
- On the Japanese disc the lethargy pill is grey at all three levels of detail, every colour record changed over the same points, its red `(255, 0, 0)` a light grey from `(158, 158, 158)` to `(181, 181, 181)` by face and its yellow `(231, 231, 0)` a dark grey of `(58, 58, 58)` or `(59, 59, 59)`; the bouncy pill and the third pill are as the US file has them.
- The quad flag is what settled the triangles, which the fourth index could not: it is 0 on the spikes and 116 to 120 on the ball's pole, and read as quads the polygons without the flag were off their plane by a triangle's width on 88% of them, the ones with it on none. 3,306 of the 6,449 polygons are triangles.
- Normals, where there is a fourth block and bit 1 of the flags is set: packed like the vertices, unit length 4096. Only the balls have them.

**How the game draws a model.** The walk queues a command for each thing it draws (`0x8002d2ac`), and after the gem's glints `0x800530b0` turns the commands into the GPU's primitives (`0x8002aa68`): for each model a draw mode whose blend is the `i16`'s two low bits, with dithering off (`0x800533d8`), the polygons linked one after another behind it, and a draw mode that sets blend 0 with dithering on (`0x80053acc`, `0x80053b28`), so a model's own polygons are drawn undithered.

The flags say in what order the polygons go (`0x8005343c`): at 0 in the order the model holds them, at 1 each by the mean depth of its corners into a table of 64 steps of 16 units about the model's own depth, which the chain runs through from the furthest step to the nearest and, within a step, from the polygon linked last to the one linked first (`0x80053b04`, `avsz3` and `avsz4`, `0x80053da8`), and at 2 in the model's order again with each corner lit by its vertex's normal (`ncct`, `0x8005446c`); 78 of the 105 models are drawn in their order, 13 by depth and the 14 balls by their normals.

A polygon whose first corner's red is odd is dropped where its first three corners do not run clockwise on the screen (`0x80053530`, then `nclip` and `0x8005359c`), which on every model is where it faces away: 5,812 of the 5,849 opaque polygons are culled so, and of the 600 translucent ones only the glass ball's 180 polygons, so every other translucent polygon is seen from both sides.

A flat polygon is drawn in its first corner's colour and a Gouraud one in each corner's colour (`0x80053604`), every colour scaled by the light of the face its thing stands on and faded with its depth (`dcpl`).

A translucent polygon meets what is behind it in its model's blend: half of each, 0, on the gem, the hourglass's glass and the glass ball's shell, and what is behind with a quarter of the polygon added, 3, on the exit's cross and on the hidden exit, which is translucent all over and so shows as a faint green glow.

On the Japanese disc the exit is a sign reading 出口 in place of the cross, 62 quads over 64 vertices, 364 wide and 196 tall, green and red as the cross is, with no translucent polygon and every polygon culled where it faces away.

The hidden exit there is the same quads over the same points, seven of them wound the other way about, in the green exit's colours but for thirteen corners one lower in green, with the first corner's red even on every polygon where the exit's is odd and every one translucent in blend 3, so no polygon is culled where it faces away and it shows there as a faint green sign seen from both sides.

The viewer draws a model as the game does, laid out and turned as the game lays it out and turns it, in its order or by depth as its flags say, dropping a polygon the game culls where it faces away and blending a translucent one as its model says, half and half or a quarter added, and filling a flat polygon with its first corner's colour and a Gouraud one with the mean of its corners; it sorts by the mean depth itself rather than in the game's 64 steps, and leaves out the fade with depth.

**How the game lays a model out and turns it.** The renderer takes a vertex's two words as the coprocessor's `x` and `y` and its third as `z` (`0x80053464` to `0x80053480`), so what the build ships as `y`, up off the face, is the game's `z`, and the build's `z`, the way a thing points, is the game's `y`.

A thing on a block is drawn by the camera's matrix times its own times a spin (`0x800603f8`, from `0x80039d7c`): its own, built as the level loads (`0x80039ec0`), lays the model's `z` along the outward normal of its face, its `y` along the face's first tangent turned by its `f2` as a `facing` turns a thing ([level-format.md](level-format.md)), whatever its type (`0x800359ec`), and its `x` along `y × z`, a turn with no mirror in it.

The spin is built from three angles in 4096ths, right-handed turns about the model's own `x`, `y` and `z`, either by `0x80060a38`, which turns it about `z` first and `x` last, for the teleporter, the exits and the gem (`0x80039b38`), or by `0x80060cc8`, which turns it about `x` first and `z` last, for the coins, the key, the fruit, the pills, the hourglass and the hedgehog (`0x80039ac0`); the teleporter, the exits and the gem turn about `z` alone, so the first routine's order tells only on the stars and the wandering ball.

The wheel and the corkscrew are laid out as a thing on a block is and spun by the second routine (`0x8003ec88`, `0x8003e4d0`), and their draws multiply in, innermost, a second matrix the loader builds for every captivator, a quarter turn about `z` (`0x8003b914`, `0x8003b980`), so that they are turned a quarter before the spin; the stars and the wandering ball are turned by the first alone, in the world's axes, with no face in it (`0x8003d7c8`, `0x8003de4c`, `0x8003f390`).

The ball is laid out from its face and `facing` turned a half about its `x`, so that its own `z` points into the face (`0x800310dc` to `0x8003115c`), and squashed in its own axes before it is turned (`0x800313f0`). So on the screen, whose `y` runs down, a polygon a thing turns toward the view has its first three corners running clockwise.

The motion table ([motion.md](motion.md)) ships these readings, each type's spin as `order`, the stars' and the wandering ball's world axes as `axes`, and the turn a model takes ahead of its spin as `before`.

**How the game lights a model.** The draw puts three words of light in each command (`0x8002d3c4` to `0x8002d3d0`), and the renderer multiplies every colour by them, 4096 a whole channel and 255 where a channel passes it (`dcpl`).

A thing on a block takes the .TGI header's triple for the shade of its face, the same table and the same three triples its world's textures are shaded with ([tgi.md](tgi.md)), the face picking its shade by the header's word at 300 (`0x8002d3a8`) and the shade its triple from the set at byte 24, or from the set at 156, 4096 throughout, on a level the game plays as a bonus level (`0x8002d364`); so in Hiro a thing on a top shows 0.9, 0.8 and 0.8 of its colours, on the face the world lights most 1.2, 1.1 and 1.1, and on the one it lights least 0.7, 0.6 and 0.6.

While a teleporter's light is lit, its light is taken again times its circuit's triple at `0x800a3308`, 1.5 in the channels its colour lights and 1.25 in the others, and a switch's or an open exit's light twice over (`0x8002d49c`, `0x8002d694`, `0x8002d5c8`), so a lit device's model flashes with its light.

The viewer lights what stands on a block and a lit device's model so, as the game does.

The build ships each world's two sets under `skins` as `light`, and a lit device's lift with the devices' light as `lift` ([motion.md](motion.md)).

The captivators take 4096 (`0x8003dd0c`), and the ball three words of its own, 4096 in each channel until something it touches tints it (`0x80032158` onward).

The ball, drawn by its normals, lights each corner from a light fixed to the camera, to the left, above and in front of it in the measures 1, 4 and 2 (`0x800315e8` to `0x80031658`, from the rows of the camera's matrix that `0x80034a50` copies into the ball's state, normalised by `0x80060218`), carried into the ball's frame by its rotation (`0x80032004`).

The coprocessor takes 4000 of 4096 of how squarely a normal faces the light over a background of 2048, times a base of 178 (`0x8003240c` to `0x800324a0`, `ncct`), which the renderer keeps for each vertex as a share of 256 (`0x8005443c` to `0x800544cc`); for each corner `gpf` scales the three light words by the share (`0x8005467c`) and `dcpl` applies them to the corner's colour, so a corner is drawn at between 89 and 255 of 256 of its colour, 89 where it faces away from the light and all of it from where it faces the light nearly squarely.

The table ships the ball's light with how it moves, as `light`, and the viewer lights the ball by it from its own view, a polygon in the mean of its corners as lit, and leaves out the tints.

**No mesh is textured.** Every polygon is coloured, flat or Gouraud, and nothing in a model names a texture.

The fourteen balls are the beach-ball designs the Japanese release lets a player pick from.

**The last section is the sprites and the lettering**, 148 uploads walked by `0x80022fd8` into the US executable's table of 180 twelve-byte descriptors (bpp, whether the upload named a blend, which the HUD's primitives take for their semi-transparency, the GPU's clut and tpage words, the offset within the page, width, height) that the HUD code indexes.

Each is `i16 bpp, i16 abr`, for a paletted one `u16 x, y` of its palette in VRAM, `i16 inline, u16 late` and the palette's words where `inline` is 0, then `u16 x, y, w, h` of the image and its pixels where `late` is 0, `w` in pixels and the data padded to four bytes; every one is a VRAM upload like the artwork's uploads, to the right of the world's textures at `x` 496 and up.

Entries 0 to 9 are the five fruit icons grey and lit, in the same order as types 43 to 47; 10 to 16 are seven 64x64 pictures (a purple glow, the ball's stripes, a red disc, an electric blue ball, a shell, two rings of sparks), the sprites of the bursts a pickup and a teleport start ([motion.md](motion.md)); 23 to 26 and 126 are the controller's four symbols; 27 to 70 the menus' words, and 132 to 147 the title, the copyright notice, a dot, a red barred circle, the HUD's SCORE and LEVELS and the five letters of BONUS, each grey and lit; 71 to 102 thirty-two 4x3 swatches; 119 and 125 the digits; 122 a single white texel, two pixels by one, that the lethargy pill's flash and fade stretch over the screen ([camera.md](camera.md)); 123 and 124 the key icon grey and gold; and 130 and 131 the two shadows the game draws under the ball and the captivators, a round one and a square one, both taken away from what is behind them ([motion.md](motion.md)).

The header's six bounds (10, 17, 27, 71, 103, 116) are where these groups begin.

On the PAL disc seventeen of the 148 differ: fifteen are redrawn one to three rows taller at the same width, the ten fruit icons, the two key icons and three more (116 to 118), and the title (132) and the copyright notice (133) are the PAL game's own.

On the Japanese disc the file holds 181 uploads: the menus' 44 words are 63 at 27 to 89, most of them Japanese lettering, 29 and 30 the US file's 29 and 30 and 77 and 78 its 67 and 68 ten places on, the title, the copyright notice and two of the HUD's words (132, 133, 136 and 137 on the US file) are the Japanese game's own at 151, 152, 155 and 156, fourteen more stand at its end, 167 to 180, and every other sprite is the US picture, at its US place up to 26 and nineteen places on past the words, the shadows at 149 and 150.

Its header's fourth word is 63 for the 63 words, so its bounds are 10, 17, 27, 90, 122 and 135 and the sixth puts its shadows where they stand.

The build ships the seven sprites of the bursts for play's effects on one sheet, `public/tex/sparks.png`, beside the worlds' atlases: each is read through its palette into RGB, black wherever a texel adds nothing, since the game adds every one to what is behind it, and laid in a row in the header's order, so a sprite is found on the sheet by its number and the side and the count that `objects.json` carries under `sparks`.

The seven bursts and the two shadows are the same pixels on all three discs, so the sheet and the shadows ship once, for every release.

The build stops where the header counts other than the sprites the game lays quads for, where one is not a paletted square of one size drawn in the blend that adds, or where a texel would be drawn opaque rather than added.

**The fifth section is the jump's arc.** It opens with a count of 33 and three halfwords of nothing, and holds 32 rows of `i16` height, right and back, where the ball's centre stands on each frame of a jump against where the jump began, in the game's units: right is 0 throughout, back runs from −47 to −1023, a block and all but one unit of a second, and the height rises from 0 to 458 at the 15th and 16th rows and comes down to −24, with four bytes left at the section's end.

On the PAL disc the section is 172 bytes and holds a count of 28 and 27 rows, back running from −48 to −1024 and the height rising to 411 at the 14th and 15th rows and coming down to 56, with two bytes left; the Japanese disc's arc is the US one.

With no skip, the PAL count falling by one to nothing, the PAL hop's last frame reads the row past the section's rows, the two bytes left and the next section's first four, a height of 0, so a PAL hop ends at the face's level where the US hop's 31st row ends it 14 below.

The parser sums the header's section sizes and keeps where the fifth begins (`0x80022e44` to `0x80022ea0`), the ball's init copies that as the jump's table (`0x8002f2ec`, `0x8002f368`), and the jump runs through 30 of the rows while the hop takes the heights' differences ([motion.md](motion.md)).

The build ships the count and the rows as `jump`.

A disc whose arc differs ships its count and rows under `objects.jump` in its release file, which a planned route's jump and the ball's jump in play take under that disc ([viewer.md](viewer.md)).

The PAL file's arc is 28 rows, the section's 27 and the row past them the hop's last frame reads, since the build reads a disc's file with that disc's own skip once its executable is read through its map, the PAL's none, and records the skip under `objects.readings` as read, null.

**The scale.** A block is 512 units: a crumbling block's record keeps its cell times 512, and the spikes and the teleporter, which cover a block's face, are 462 and 486 across. The ball is radius 100, the exit 266 wide, a coin 186.

On the Japanese disc the exit's sign is 364 wide.

The sheet draws every model at one scale on that reading, and the viewer draws each object as itself at the same scale, standing on its face with its lowest point just off the block, a captivator at the height the game draws its entry ([motion.md](motion.md)), turned the way its record says where it has a direction, and the start as the world's ball turned the way it faces.

Fire, ice and the clock, having no mesh, are the faces the game paints them as ([tgi.md](tgi.md)).

## Not settled

**Sections 1 to 3**, 1,920, 8,192 and 8,192 bytes; the two of 8 KB are the size of sixteen 256-colour palettes and are not needed to draw anything above.

Section 4 is twelve bytes of text, `dummy!!!` and two line breaks.

**Which ball a Japanese world shows.** The Japanese file's first table names the same fourteen balls with entries 3 to 12 in another order, and the word its pick routine reads for the world's place is not traced on that disc, so whether a world there shows the ball the US entry names or the one its own entry names is not read, and the map draws the US order on every disc until it is.
