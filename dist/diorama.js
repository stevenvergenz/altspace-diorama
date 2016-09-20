'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Diorama = function () {
	function Diorama() {
		_classCallCheck(this, Diorama);

		var self = this;

		self.assetCache = {
			models: {},
			textures: {},
			videos: {}
		};

		self.scene = new THREE.Scene();
		self.previewCamera = new THREE.OrthographicCamera();
		self.scene.add(self.previewCamera);

		// set up renderer and scale
		if (altspace.inClient) {
			self.renderer = altspace.getThreeJSRenderer();
			Promise.all([altspace.getEnclosure(), altspace.getSpace()]).then(function (_ref) {
				var _ref2 = _slicedToArray(_ref, 2);

				var e = _ref2[0];
				var s = _ref2[1];

				self.env = Object.freeze({
					innerHeight: e.innerHeight,
					innerWidth: e.innerWidth,
					innerDepth: e.innerDepth,
					pixelsPerMeter: e.pixelsPerMeter,
					sid: s.sid,
					name: s.name,
					templateSid: s.templateSid
				});

				self.scene.scale.multiplyScalar(e.pixelsPerMeter);
			});
		} else {
			// set up preview renderer, in case we're out of world
			self.renderer = new THREE.WebGLRenderer();
			self.renderer.setSize(720, 720);
			self.renderer.setClearColor(0x888888);
			document.body.appendChild(self.renderer.domElement);

			// set up cursor emulation
			altspace.utilities.shims.cursor.init(self.scene, self.previewCamera, { renderer: self.renderer });

			// stub environment
			self.env = Object.freeze({
				innerWidth: 1024,
				innerHeight: 1024,
				innerDepth: 1024,
				pixelsPerMeter: 1024 / 3,
				sid: 'browser',
				name: 'browser',
				templateSid: 'browser'
			});
		}
	}

	_createClass(Diorama, [{
		key: 'start',
		value: function start() {
			var self = this;

			// construct dioramas

			for (var _len = arguments.length, modules = Array(_len), _key = 0; _key < _len; _key++) {
				modules[_key] = arguments[_key];
			}

			modules.forEach(function (module) {
				var root = new THREE.Object3D();
				self.scene.add(root);

				self.loadAssets(module.assets).then(function (results) {
					module.initialize(self.env, root, results);
				});
			});

			// start animating
			window.requestAnimationFrame(function animate(timestamp) {
				window.requestAnimationFrame(animate);
				self.scene.updateAllBehaviors();
				self.renderer.render(self.scene, self.previewCamera);
			});
		}
	}, {
		key: 'loadAssets',
		value: function loadAssets(manifest) {
			var self = this;

			return new Promise(function (resolve, reject) {
				// populate cache
				Promise.all([

				// populate model cache
				Promise.all(Object.keys(manifest.models || {}).map(function (id) {
					var url = manifest.models[id];
					if (self.assetCache.models[url]) return Promise.resolve(self.assetCache.models[url]);else return Diorama.ModelPromise(url).then(function (model) {
						self.assetCache.models[url] = model;
					});
				})),

				// populate explicit texture cache
				Promise.all(Object.keys(manifest.textures || {}).map(function (id) {
					var url = manifest.textures[id];
					if (self.assetCache.textures[url]) return Promise.resolve(self.assetCache.textures[url]);else return Diorama.TexturePromise(url).then(function (texture) {
						self.assetCache.textures[url] = texture;
					});
				}))]).catch(function () {
					return reject.apply(undefined, arguments);
				}).then(function () {
					// populate payload from cache
					var payload = { models: {}, textures: {} };

					for (var i in manifest.models) {
						payload.models[i] = self.assetCache.models[manifest.models[i]];
					}

					for (var _i in manifest.textures) {
						payload.textures[_i] = self.assetCache.textures[manifest.textures[_i]];
					}

					resolve(payload);
				});
			});
		}
	}]);

	return Diorama;
}();

;
'use strict';

{
	window.Diorama.ModelPromise = function (url) {
		return new Promise(function (resolve, reject) {
			// NOTE: glTF loader does not catch errors
			if (/\.gltf$/.test(url)) {
				var loader = new THREE.glTFLoader();
				loader.load(url, function (result) {
					resolve(result.scene.children[0].children[0]);
				});
			}
		});
	};

	window.Diorama.TexturePromise = function (url) {
		return new Promise(function (resolve, reject) {
			var loader = new THREE.TextureLoader();
			loader.load(url, resolve, null, reject);
		});
	};

	window.Diorama.VideoPromise = function (url) {
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

		//cache.videos[url] = tex;
		//payload.videos[id] = cache.videos[url];

		return Promise.resolve(tex);
	};
}