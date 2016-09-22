'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Diorama = function () {
	function Diorama() {
		var _ref = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

		var _ref$bgColor = _ref.bgColor;
		var bgColor = _ref$bgColor === undefined ? 0xaaaaaa : _ref$bgColor;
		var _ref$gridOffset = _ref.gridOffset;
		var gridOffset = _ref$gridOffset === undefined ? new THREE.Vector3() : _ref$gridOffset;

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
			Promise.all([altspace.getEnclosure(), altspace.getSpace()]).then(function (_ref2) {
				var _ref3 = _slicedToArray(_ref2, 2);

				var e = _ref3[0];
				var s = _ref3[1];

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
			self.renderer.setSize(document.body.clientWidth, document.body.clientHeight);
			self.renderer.setClearColor(bgColor);
			document.body.appendChild(self.renderer.domElement);

			self.previewCamera = new Diorama.PreviewCamera();
			self.previewCamera.gridHelper.position.copy(gridOffset);
			self.scene.add(self.previewCamera, self.previewCamera.gridHelper);
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

			// determine which assets aren't shared
			var singletons = {};

			for (var _len = arguments.length, modules = Array(_len), _key = 0; _key < _len; _key++) {
				modules[_key] = arguments[_key];
			}

			modules.forEach(function (mod) {
				function checkAsset(url) {
					if (singletons[url] === undefined) singletons[url] = true;else if (singletons[url] === true) singletons[url] = false;
				}
				Object.keys(mod.assets.textures || {}).map(function (k) {
					return mod.assets.textures[k];
				}).forEach(checkAsset);
				Object.keys(mod.assets.models || {}).map(function (k) {
					return mod.assets.models[k];
				}).forEach(checkAsset);
			});

			// construct dioramas
			modules.forEach(function (module) {
				var root = new THREE.Object3D();
				self.scene.add(root);

				if (self.previewCamera) {
					root.add(new THREE.AxisHelper(1));
				}

				self.loadAssets(module.assets, singletons).then(function (results) {
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
		value: function loadAssets(manifest, singletons) {
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
						var url = manifest.models[i];
						var t = self.assetCache.models[url];
						payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
					}

					for (var _i in manifest.textures) {
						var _url = manifest.textures[_i];
						var _t = self.assetCache.textures[_url];
						payload.textures[_i] = _t ? singletons[_url] ? _t : _t.clone() : null;
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
	Diorama.ModelPromise = function (url) {
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

	Diorama.TexturePromise = function (url) {
		return new Promise(function (resolve, reject) {
			var loader = new THREE.TextureLoader();
			loader.load(url, resolve, null, reject);
		});
	};

	Diorama.VideoPromise = function (url) {
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
		var viewSize = arguments.length <= 1 || arguments[1] === undefined ? 40 : arguments[1];
		var lookDirection = arguments.length <= 2 || arguments[2] === undefined ? new THREE.Vector3(0, -1, 0) : arguments[2];

		_classCallCheck(this, PreviewCamera);

		var _this = _possibleConstructorReturn(this, (PreviewCamera.__proto__ || Object.getPrototypeOf(PreviewCamera)).call(this, -1, 1, 1, -1, .1, 400));

		_this._viewSize = viewSize;
		_this._focus = focus;
		_this._lookDirection = lookDirection;
		_this.gridHelper = new THREE.GridHelper(300, 1);
		return _this;
	}

	_createClass(PreviewCamera, [{
		key: 'registerHooks',
		value: function registerHooks(renderer) {
			var self = this;
			self.renderer = renderer;

			// set styles on the page, so the preview works right
			document.body.parentElement.style.height = '100%';
			document.body.style.height = '100%';
			document.body.style.margin = '0';
			document.body.style.overflow = 'hidden';

			var info = document.createElement('p');
			info.innerHTML = ['Middle click and drag to pan', 'Mouse wheel to zoom', 'Arrow keys to rotate'].join('<br/>');
			Object.assign(info.style, {
				position: 'fixed',
				top: '10px',
				left: '10px',
				margin: 0
			});
			document.body.appendChild(info);

			// resize the preview canvas when window resizes
			window.addEventListener('resize', function (e) {
				return self.recomputeViewport();
			});
			self.recomputeViewport();

			// middle click and drag to pan view
			var dragStart = null,
			    focusStart = null;
			window.addEventListener('mousedown', function (e) {
				if (e.button === 1) {
					dragStart = { x: e.clientX, y: e.clientY };
					focusStart = self._focus.clone();
				}
			});
			window.addEventListener('mouseup', function (e) {
				if (e.button === 1) {
					dragStart = null;
					focusStart = null;
				}
			});
			window.addEventListener('mousemove', function (e) {
				if (dragStart) {
					var _document$body = document.body;
					var w = _document$body.clientWidth;
					var h = _document$body.clientHeight;

					var pixelsPerMeter = Math.sqrt(w * w + h * h) / self._viewSize;
					var dx = e.clientX - dragStart.x,
					    dy = e.clientY - dragStart.y;
					var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);

					self._focus.copy(focusStart).add(self.up.clone().multiplyScalar(dy / pixelsPerMeter)).add(right.multiplyScalar(-dx / pixelsPerMeter));

					self.recomputeViewport();
				}
			});

			// wheel to zoom
			window.addEventListener('wheel', function (e) {
				if (e.deltaY < 0) {
					self._viewSize *= 0.95;
					self.recomputeViewport();
				} else if (e.deltaY > 0) {
					self._viewSize *= 1.05;
					self.recomputeViewport();
				}
			});

			// arrow keys to rotate
			window.addEventListener('keydown', function (e) {
				if (e.key === 'ArrowDown') {
					var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
					self._lookDirection.applyAxisAngle(right, Math.PI / 2);
					self.gridHelper.rotateOnAxis(right, Math.PI / 2);
					self.recomputeViewport();
				} else if (e.key === 'ArrowUp') {
					var _right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
					self._lookDirection.applyAxisAngle(_right, -Math.PI / 2);
					self.gridHelper.rotateOnAxis(_right, -Math.PI / 2);
					self.recomputeViewport();
				} else if (e.key === 'ArrowLeft') {
					self._lookDirection.applyAxisAngle(self.up, -Math.PI / 2);
					self.gridHelper.rotateOnAxis(self.up, -Math.PI / 2);
					self.recomputeViewport();
				} else if (e.key === 'ArrowRight') {
					self._lookDirection.applyAxisAngle(self.up, Math.PI / 2);
					self.gridHelper.rotateOnAxis(self.up, Math.PI / 2);
					self.recomputeViewport();
				}
			});
		}
	}, {
		key: 'recomputeViewport',
		value: function recomputeViewport() {
			var _document$body2 = document.body;
			var w = _document$body2.clientWidth;
			var h = _document$body2.clientHeight;

			// resize canvas

			this.renderer.setSize(w, h);

			// compute window dimensions from view size
			var ratio = w / h;
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