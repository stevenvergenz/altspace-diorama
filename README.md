Diorama - Altspace Made Easy
=================================================

Diorama is a framework for running multiple micro-apps out of a single AltspaceVR enclosure. It handles most of tedious stuff that every app needs, like setting up the render loop, scaling the enclosure, and loading models/textures, and lets you get right to the meat of your idea.

Features
-----------------------------------------------

* Compartmentalized code for different micro-apps ("dioramas")
* Easy-to-use asset loader and cache
* Reduces boilerplate code
* Encourages best practices
* Includes web browser preview mode


Complete Example
------------------------------------------------

```html
<html>
	<head>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r74/three.js"></script>
		<script src="http://sdk.altvr.com/libs/altspace.js/0.18.2/altspace.min.js"></script>
		<script src="../lib/ColladaLoader.js"></script>
		<script src="../dist/diorama.js"></script>
	</head>
	<body>
		<script>
            // this is a "diorama"
			var globe = {
				initialize: function(env, root, assets){
				    // passed the enclosure info, a scene root (in meter scale),
				    // and the requested assets
					root.rotateX(-Math.PI/2);
					root.add(assets.models.globe);
				},
				assets: {
					models: {globe: 'models/globe.dae'}
				}
			};

			var diorama = new Diorama();
			diorama.start(globe);
		</script>
	</body>
</html>
```

API
-----------------------------------------------

### `new Diorama()` [constructor]

**Arguments**: None

**Returns**: `Diorama`

This class is the entrypoint into the framework. When you create an instance of Diorama, the enclosure and space information is saved into the instance, and it sets up a new empty cache.


### `Diorama.start(d1, d2, ... dn)` [instance function]

**Arguments**: The diorama objects you want to run

**Returns**: None

Loads the assets for the requested dioramas, and calls their `initialize` functions. Also starts the render loop.


### `Diorama.loadAssets(manifest)` [instance function]

**Arguments**: A diorama asset manifest

**Returns**: A [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) that resolves with the requested assets

This function is already called by `Diorama.start`, but is included here for flexibility. Give it the list of assets you want, and it will start them loading (from cache if available), and return a promise that will resolve when the assets are done loading.


### Diorama Object Format

Diorama objects are required to have only one property: a function `initialize`. You may also want to provide an asset manifest (`assets`).

#### `initialize(env, root, assets)` [function]

This is the kickoff point for your diorama. Given the space information (`env`), a scene root (`root`), and your assets (`assets`), construct your scene here. For best compatibility with other dioramas, it is recommended that you do not access any scene node above the root you are given.

* `env` [Object] - The concatenated responses of `altspace.getEnclosure()` and `altspace.getSpace()`.
* `root` [Object3D] - The root of your diorama, in meter scale. If you want your diorama placed somewhere in the room other than in the center of the enclosure, set the `root.position`.
* `assets` [Object] - Contains the `models` and `textures` requested by your diorama. See `assets` below.


#### `assets` [Object]

Specify the models and textures that you need for your diorama here. This object can contain a `models` object and/or a `textures` object. Each of these sub-objects should contain identifiers for the assets as property names, and URLs to the assets as property values.

For example, if you wanted to load an OBJ file at './models/mymodel.obj', you might have this as an assets manifest:

```javascript
"assets": {
    "models": {
        "mymodel": "./models/mymodel.obj"
    }
}
```

You would then access this model at `assets.models.mymodel` in your `initialize` function.







