'use strict';

(function (exports) {
	var cache = {
		models: {},
		textures: {},
		videos: {}
	};

	// loads an asset manifest from a vignette
	function loadAssets(manifest, callback) {
		var waiting = 0;
		var payload = {};

		// load models
		if (manifest.models) {
			payload.models = {};

			// loop over each entry in the model manifest
			Object.keys(manifest.models).forEach(function (id) {
				var url = manifest.models[id];

				// check cache for asset
				if (cache.models[url]) {
					payload.models[id] = cache.models[url].clone();
				}

				// load gltf models
				else if (/\.gltf$/.test(url)) {
						// increment wait count
						waiting++;

						// start loader
						var loader = new THREE.glTFLoader();
						loader.load(url, function (result) {
							// write model to cache and payload
							cache.models[url] = result.scene.children[0].children[0];
							payload.models[id] = cache.models[url].clone();

							// finish
							checkComplete(true);
						});
					}
			});
		}

		if (manifest.textures) {
			payload.textures = {};

			// loop over each entry in the texture manifest
			Object.keys(manifest.textures).forEach(function (id) {
				var url = manifest.textures[id];

				// check cache for asset
				if (cache.textures[url]) {
					payload.textures[id] = cache.textures[url].clone();
				}

				// load textures
				else {
						// increment wait count
						waiting++;

						// start loader
						var loader = new THREE.TextureLoader();
						loader.load(url, function (texture) {
							// write texture to cache and payload
							cache.textures[url] = texture;
							payload.textures[id] = cache.textures[url].clone();

							// finish
							checkComplete(true);
						}, null, function (err) {
							console.error(err);
							checkComplete(true);
						});
					}
			});
		}

		if (manifest.videos) {
			payload.videos = {};

			// loop over each entry in the texture manifest
			Object.keys(manifest.videos).forEach(function (id) {
				var url = manifest.videos[id];

				// check cache for asset
				if (cache.videos[url]) {
					payload.videos[id] = cache.videos[url].clone();
				}

				// load videos
				else {
						// start loader
						var vidSrc = document.createElement('video');
						vidSrc.autoplay = true;
						vidSrc.loop = true;
						vidSrc.src = url;
						vidSrc.style.display = 'none';
						document.body.appendChild(vidSrc);

						var tex = new THREE.VideoTexture(vidSrc);
						tex.minFilter = THREE.LinearFilter;
						tex.magFilter = THREE.LinearFilter;
						tex.format = THREE.RGBFormat;

						cache.videos[url] = tex;
						payload.videos[id] = cache.videos[url];
					}
			});
		}

		checkComplete();

		function checkComplete(done) {
			if (done) waiting--;
			if (waiting === 0) callback(payload);
		}
	}

	exports.loadAssets = loadAssets;
})(window.Diorama = window.Diorama || {});
'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

(function (Diorama) {
	var renderer, camera, env;
	var scene = new THREE.Scene();

	Diorama.load = function (modules) {
		// set up renderer and scale
		if (altspace.inClient) {
			renderer = altspace.getThreeJSRenderer();
			Promise.all([altspace.getEnclosure(), altspace.getSpace()]).then(function (_ref) {
				var _ref2 = _slicedToArray(_ref, 2);

				var e = _ref2[0];
				var s = _ref2[1];

				env = Object.freeze({
					innerHeight: e.innerHeight,
					innerWidth: e.innerWidth,
					innerDepth: e.innerDepth,
					pixelsPerMeter: e.pixelsPerMeter,
					sid: s.sid,
					name: s.name,
					templateSid: s.templateSid
				});

				scene.scale.multiplyScalar(e.pixelsPerMeter);
				start();
			});
		} else {
			// set up preview renderer, in case we're out of world
			renderer = new THREE.WebGLRenderer();
			renderer.setSize(720, 720);
			renderer.setClearColor(0x888888);
			document.body.appendChild(renderer.domElement);

			camera = new THREE.PerspectiveCamera(90, 1, 0.01, 10000);
			camera.position.set(0, -10, 20);
			camera.rotation.set(0, Math.PI, 0);
			scene.add(camera);

			// set up cursor emulation
			altspace.utilities.shims.cursor.init(scene, camera, { renderer: renderer });

			// stub environment
			env = Object.freeze({
				innerWidth: 1024,
				innerHeight: 1024,
				innerDepth: 1024,
				pixelsPerMeter: 1024 / 3,
				sid: 'browser',
				name: 'browser',
				templateSid: 'browser'
			});

			start();
		}

		function start() {
			// construct dioramas
			modules.forEach(function (module) {
				var root = new THREE.Object3D();
				scene.add(root);

				Diorama.loadAssets(module.assets, function (results) {
					module.initialize(env, root, results);
				});
			});

			// start animating
			window.requestAnimationFrame(function animate(timestamp) {
				window.requestAnimationFrame(animate);
				scene.updateAllBehaviors();
				renderer.render(scene, camera);
			});
		}
	};
})(window.Diorama = window.Diorama || {});