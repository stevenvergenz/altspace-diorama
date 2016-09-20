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
			self.renderer.setSize(window.innerWidth, window.innerHeight);
			self.renderer.setClearColor(0x888888);
			document.body.appendChild(self.renderer.domElement);

			self.previewCamera = new Diorama.PreviewCamera();
			self.scene.add(self.previewCamera);
			self.previewCamera.registerHooks(self.renderer);

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

			function PromisesFinished(arr) {
				return new Promise(function (resolve, reject) {
					var waiting = arr.length;

					function checkDone() {
						if (--waiting === 0) resolve();
					}

					arr.forEach(function (p) {
						p.then(checkDone, checkDone);
					});
				});
			}

			return new Promise(function (resolve, reject) {
				// populate cache
				PromisesFinished([

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
				}))]).then(function () {
					// populate payload from cache
					var payload = { models: {}, textures: {} };

					for (var i in manifest.models) {
						var t = self.assetCache.models[manifest.models[i]];
						payload.models[i] = t ? t.clone() : null;
					}

					for (var _i in manifest.textures) {
						var _t = self.assetCache.textures[manifest.textures[_i]];
						payload.textures[_i] = _t ? _t.clone() : null;
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
			if (/\.gltf$/i.test(url)) {
				if (THREE.glTFLoader) {
					var loader = new THREE.glTFLoader();
					loader.load(url, function (result) {
						resolve(result.scene.children[0].children[0]);
					});
				} else {
					console.error('THREE.glTFLoader not found. "' + url + '" not loaded.');
					reject();
				}
			} else if (/\.dae$/i.test(url)) {
				if (THREE.ColladaLoader) {
					var _loader = new THREE.ColladaLoader();
					_loader.load(url, function (result) {
						return resolve(result.scene.children[0]);
					}, null, reject);
				} else {
					console.error('THREE.ColladaLoader not found. "' + url + '" not loaded.');
					reject();
				}
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
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

Diorama.PreviewCamera = function (_THREE$OrthographicCa) {
	_inherits(PreviewCamera, _THREE$OrthographicCa);

	function PreviewCamera() {
		var focus = arguments.length <= 0 || arguments[0] === undefined ? new THREE.Vector3() : arguments[0];
		var viewSize = arguments.length <= 1 || arguments[1] === undefined ? 20 : arguments[1];
		var lookDirection = arguments.length <= 2 || arguments[2] === undefined ? new THREE.Vector3(0, -1, 0) : arguments[2];

		_classCallCheck(this, PreviewCamera);

		var _this = _possibleConstructorReturn(this, (PreviewCamera.__proto__ || Object.getPrototypeOf(PreviewCamera)).call(this, -1, 1, 1, -1, .1, 400));

		_this._viewSize = viewSize;
		_this._focus = focus;
		_this._lookDirection = lookDirection;
		return _this;
	}

	_createClass(PreviewCamera, [{
		key: 'registerHooks',
		value: function registerHooks(renderer) {
			this.renderer = renderer;
			document.body.style.margin = '0';

			this.recomputeViewport();
		}
	}, {
		key: 'recomputeViewport',
		value: function recomputeViewport() {
			// resize canvas
			this.renderer.setSize(window.innerWidth, window.innerHeight);

			// compute window dimensions from view size
			var ratio = window.innerWidth / window.innerHeight;
			var height = Math.sqrt(this._viewSize * this._viewSize / (ratio * ratio + 1));
			var width = ratio * height;

			// set frustrum edges
			this.left = -width / 2;
			this.right = width / 2;
			this.top = height / 2;
			this.bottom = -height / 2;

			this.updateProjectionMatrix();

			// update position
			this.position.copy(this._focus).sub(this._lookDirection.clone().multiplyScalar(200));
			if (Math.abs(this._lookDirection.normalize().dot(new THREE.Vector3(0, -1, 0))) === 1) this.up.set(0, 0, 1); // if we're looking down the Y axis
			else this.up.set(0, 1, 0);
			this.lookAt(this._focus);
		}
	}, {
		key: 'viewSize',
		get: function get() {
			return this._viewSize;
		},
		set: function set(val) {
			this._viewSize = val;
			this.recomputeViewport();
		}
	}, {
		key: 'focus',
		get: function get() {
			return this._focus;
		},
		set: function set(val) {
			this._focus.copy(val);
			this.recomputeViewport();
		}
	}, {
		key: 'lookDirection',
		get: function get() {
			return this._lookDirection;
		},
		set: function set(val) {
			this._lookDirection.copy(val);
			this.recomputeViewport();
		}
	}]);

	return PreviewCamera;
}(THREE.OrthographicCamera);