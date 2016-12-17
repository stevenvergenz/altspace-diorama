var Diorama = (function () {
'use strict';

var cache = {models: {}, textures: {}, posters: {}};

function ModelPromise(url)
{
	return new Promise(function (resolve, reject) {
		if(cache.models[url]){
			return resolve(cache.models[url]);
		}

		// NOTE: glTF loader does not catch errors
		else if(/\.gltf$/i.test(url)){
			if(THREE.glTFLoader){
				var loader = new THREE.glTFLoader();
				loader.load(url, function (result) {
					cache.models[url] = result.scene.children[0].children[0];
					return resolve(cache.models[url]);
				});
			}
			else if(THREE.GLTFLoader){
				var loader$1 = new THREE.GLTFLoader();
				loader$1.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					cache.models[url].matrixAutoUpdate = true;
					/*result.scene.traverse((o) => {
						if(o.material && o.material.map)
							console.log('flipY', o.material.map.flipY);
					});*/


					return resolve(cache.models[url]);
				}, function () {}, reject);
			}
			else {
				console.error(("glTF loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}

		else if(/\.dae$/i.test(url)){
			if(THREE.ColladaLoader){
				var loader$2 = new THREE.ColladaLoader();
				loader$2.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					return resolve(result.scene.children[0])
				}, null, reject);
			}
			else {
				console.error(("Collada loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}
	});
}

function TexturePromise(url){
	return new Promise(function (resolve, reject) {
		if(cache.textures[url])
			{ return resolve(cache.textures[url]); }
		else {
			var loader = new THREE.TextureLoader();
			loader.load(url, function (texture) {
				cache.textures[url] = texture;
				return resolve(texture);
			}, null, reject);
		}
	});
}

function PosterPromise(url){
	return new Promise(function (resolve, reject) {
		if(cache.posters[url])
			{ return resolve(cache.posters[url]); }
		else { return (new TexturePromise(url)).then(function (tex) {
				var ratio = tex.image.width / tex.image.height;
				var geo, mat = new THREE.MeshBasicMaterial({map: tex, side: THREE.DoubleSide});

				if(ratio > 1){
					geo = new THREE.PlaneGeometry(1, 1/ratio);
				}
				else {
					geo = new THREE.PlaneGeometry(ratio, 1);
				}

				cache.posters[url] = new THREE.Mesh(geo, mat);
				return resolve(cache.posters[url]);
			}
		); }
	});
}

var PreviewCamera = (function (superclass) {
	function PreviewCamera(focus, viewSize, lookDirection)
	{
		superclass.call(this, -1, 1, 1, -1, .1, 400);

		var settings = window.localStorage.getItem('dioramaViewSettings');
		if(settings){
			settings = JSON.parse(settings);
			if(!focus)
				{ focus = new THREE.Vector3().fromArray(settings.focus); }
			if(!viewSize)
				{ viewSize = settings.viewSize; }
			if(!lookDirection)
				{ lookDirection = new THREE.Vector3().fromArray(settings.lookDirection); }
		}

		this._viewSize = viewSize || 40;
		this._focus = focus || new THREE.Vector3();
		this._lookDirection = lookDirection || new THREE.Vector3(0,-1,0);
		this.gridHelper = new THREE.GridHelper(300, 1);
		this.gridHelper.userData = {altspace: {collider: {enabled: false}}};
		//this.gridHelper.quaternion.setFromUnitVectors( new THREE.Vector3(0,-1,0), this._lookDirection );
	}

	if ( superclass ) PreviewCamera.__proto__ = superclass;
	PreviewCamera.prototype = Object.create( superclass && superclass.prototype );
	PreviewCamera.prototype.constructor = PreviewCamera;

	var prototypeAccessors = { viewSize: {},focus: {},lookDirection: {} };

	prototypeAccessors.viewSize.get = function (){
		return this._viewSize;
	};
	prototypeAccessors.viewSize.set = function (val){
		this._viewSize = val;
		this.recomputeViewport();
	};

	prototypeAccessors.focus.get = function (){
		return this._focus;
	};
	prototypeAccessors.focus.set = function (val){
		this._focus.copy(val);
		this.recomputeViewport();
	};

	prototypeAccessors.lookDirection.get = function (){
		return this._lookDirection;
	};
	prototypeAccessors.lookDirection.set = function (val){
		this._lookDirection.copy(val);
		this.recomputeViewport();
	};

	PreviewCamera.prototype.registerHooks = function registerHooks (renderer)
	{
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
		window.addEventListener('resize', function (e) { return self.recomputeViewport(); });
		self.recomputeViewport();

		// middle click and drag to pan view
		var dragStart = null, focusStart = null;
		window.addEventListener('mousedown', function (e) {
			if(e.button === 1){
				dragStart = {x: e.clientX, y: e.clientY};
				focusStart = self._focus.clone();
			}
		});
		window.addEventListener('mouseup', function (e) {
			if(e.button === 1){
				dragStart = null;
				focusStart = null;
			}
		});
		window.addEventListener('mousemove', function (e) {
			if(dragStart)
			{
				var ref = document.body;
				var w = ref.clientWidth;
				var h = ref.clientHeight;
				var pixelsPerMeter = Math.sqrt(w*w+h*h) / self._viewSize;
				var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
				var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);

				self._focus.copy(focusStart)
					.add(self.up.clone().multiplyScalar(dy/pixelsPerMeter))
					.add(right.multiplyScalar(-dx/pixelsPerMeter));

				self.recomputeViewport();
			}
		});

		// wheel to zoom
		window.addEventListener('wheel', function (e) {
			if(e.deltaY < 0){
				self._viewSize *= 0.90;
				self.recomputeViewport();
			}
			else if(e.deltaY > 0){
				self._viewSize *= 1.1;
				self.recomputeViewport();
			}
		});

		// arrow keys to rotate
		window.addEventListener('keydown', function (e) {
			if(e.key === 'ArrowDown'){
				var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right, Math.PI/2);
				//self.gridHelper.rotateOnAxis(right, Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowUp'){
				var right$1 = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right$1, -Math.PI/2);
				//self.gridHelper.rotateOnAxis(right, -Math.PI/2);
				self.recomputeViewport();

			}
			else if(e.key === 'ArrowLeft'){
				self._lookDirection.applyAxisAngle(self.up, -Math.PI/2);
				//self.gridHelper.rotateOnAxis(self.up, -Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowRight'){
				self._lookDirection.applyAxisAngle(self.up, Math.PI/2);
				//self.gridHelper.rotateOnAxis(self.up, Math.PI/2);
				self.recomputeViewport();
			}
		});
	};

	PreviewCamera.prototype.recomputeViewport = function recomputeViewport ()
	{
		var ref = document.body;
		var w = ref.clientWidth;
		var h = ref.clientHeight;

		// resize canvas
		this.renderer.setSize(w, h);

		// compute window dimensions from view size
		var ratio = w/h;
		var height = Math.sqrt( (this._viewSize*this._viewSize) / (ratio*ratio + 1) );
		var width = ratio * height;

		// set frustrum edges
		this.left = -width/2;
		this.right = width/2;
		this.top = height/2;
		this.bottom = -height/2;

		this.updateProjectionMatrix();

		// update position
		this.position.copy(this._focus).sub( this._lookDirection.clone().multiplyScalar(200) );
		if( Math.abs( this._lookDirection.normalize().dot(new THREE.Vector3(0,-1,0)) ) === 1 )
			{ this.up.set(0,0,1); } // if we're looking down the Y axis
		else
			{ this.up.set(0,1,0); }
		this.lookAt( this._focus );

		window.localStorage.setItem('dioramaViewSettings', JSON.stringify({
			focus: this._focus.toArray(),
			viewSize: this._viewSize,
			lookDirection: this._lookDirection.toArray()
		}));
	};

	Object.defineProperties( PreviewCamera.prototype, prototypeAccessors );

	return PreviewCamera;
}(THREE.OrthographicCamera));

var Diorama = function Diorama(ref)
{
	if ( ref === void 0 ) ref = {};
	var bgColor = ref.bgColor; if ( bgColor === void 0 ) bgColor = 0xaaaaaa;
	var gridOffset = ref.gridOffset; if ( gridOffset === void 0 ) gridOffset = [0,0,0];
	var fullspace = ref.fullspace; if ( fullspace === void 0 ) fullspace = false;

	var self = this;
	self._cache = cache;
	self.scene = new THREE.Scene();

	// set up renderer and scale
	if(altspace.inClient)
	{
		self.renderer = altspace.getThreeJSRenderer();
		self._envPromise = Promise.all([altspace.getEnclosure(), altspace.getSpace()])
		.then(function (ref) {
			var e = ref[0];
			var s = ref[1];


			function adjustScale(){
				self.scene.scale.setScalar(e.pixelsPerMeter);
				self.env = Object.assign({}, e, s);
			}
			adjustScale();

			if(fullspace){
				self._fsPromise = e.requestFullspace().catch(function (e) { return console.warn('Request for fullspace denied'); });
				e.addEventListener('fullspacechange', adjustScale);
			}
			else
				{ self._fsPromise = Promise.resolve(); }
		});
	}
	else
	{
		// set up preview renderer, in case we're out of world
		self.renderer = new THREE.WebGLRenderer();
		self.renderer.setSize(document.body.clientWidth, document.body.clientHeight);
		self.renderer.setClearColor( bgColor );
		document.body.appendChild(self.renderer.domElement);

		self.previewCamera = new PreviewCamera();
		self.previewCamera.gridHelper.position.fromArray(gridOffset);
		self.scene.add(self.previewCamera, self.previewCamera.gridHelper);
		self.previewCamera.registerHooks(self.renderer);

		// set up cursor emulation
		altspace.utilities.shims.cursor.init(self.scene, self.previewCamera, {renderer: self.renderer});

		// stub environment
		self.env = {
			innerWidth: 1024,
			innerHeight: 1024,
			innerDepth: 1024,
			pixelsPerMeter: fullspace ? 1 : 1024/3,
			sid: 'browser',
			name: 'browser',
			templateSid: 'browser'
		};

		self._envPromise = Promise.resolve();
		self._fsPromise = Promise.resolve();
	}
};


Diorama.prototype.start = function start ()
{
		var modules = [], len = arguments.length;
		while ( len-- ) modules[ len ] = arguments[ len ];

	var self = this;

	// determine which assets aren't shared
	var singletons = {};
	modules.forEach(function (mod) {
		function checkAsset(url){
			if(singletons[url] === undefined) { singletons[url] = true; }
			else if(singletons[url] === true) { singletons[url] = false; }
		}
		Object.keys(mod.assets.textures || {}).map(function (k) { return mod.assets.textures[k]; }).forEach(checkAsset);
		Object.keys(mod.assets.models || {}).map(function (k) { return mod.assets.models[k]; }).forEach(checkAsset);
		Object.keys(mod.assets.posters || {}).map(function (k) { return mod.assets.posters[k]; }).forEach(checkAsset);
	});

	// determine if the tracking skeleton is needed
	var needsSkeleton = modules.reduce(function (ns,m) { return ns || m.needsSkeleton; }, false);
	if(needsSkeleton && altspace.inClient){
		self._skelPromise = altspace.getThreeJSTrackingSkeleton().then(function (skel) {
			self.scene.add(skel);
			self.env.skel = skel;
			self.env = Object.freeze(self.env);
		});
	}
	else {
		self.env = Object.freeze(self.env);
		self._skelPromise = Promise.resolve();
	}

	Promise.all([self._envPromise, self._fsPromise, self._skelPromise]).then(function () {
		// construct dioramas
		modules.forEach(function(module)
		{
			var root = null;

			if(module instanceof THREE.Object3D){
				root = module;
			}
			else
			{
				root = new THREE.Object3D();

				// handle absolute positioning
				if(module.transform){
					root.matrix.fromArray(module.transform);
					root.matrix.decompose(root.position, root.quaternion, root.scale);
				}
				else {
					if(module.position){
						root.position.fromArray(module.position);
					}
					if(module.rotation){
						root.rotation.fromArray(module.rotation);
					}
				}
			}

			// handle relative positioning
			if(module.verticalAlign){
				var halfHeight = self.env.innerHeight/(2*self.env.pixelsPerMeter);
				switch(module.verticalAlign){
				case 'top':
					root.translateY(halfHeight);
					break;
				case 'bottom':
					root.translateY(-halfHeight);
					break;
				case 'middle':
					// default
					break;
				default:
					console.warn('Invalid value for "verticalAlign" - ', module.verticalAlign);
					break;
				}
			}

			self.scene.add(root);

			if(self.previewCamera){
				var axis = new THREE.AxisHelper(1);
				axis.userData.altspace = {collider: {enabled: false}};
				root.add(axis);
			}

			self.loadAssets(module.assets, singletons).then(function (results) {
				module.initialize(self.env, root, results);
			});
		});
	});

	// start animating
	window.requestAnimationFrame(function animate(timestamp)
	{
		window.requestAnimationFrame(animate);
		self.scene.updateAllBehaviors();
		if(window.TWEEN) { TWEEN.update(); }
		self.renderer.render(self.scene, self.previewCamera);
	});
};

Diorama.prototype.loadAssets = function loadAssets (manifest, singletons)
{
	var self = this;

	return new Promise(function (resolve, reject) {
		// populate cache
		Promise.all(Object.keys(manifest.models || {}).map(function (id) { return ModelPromise(manifest.models[id]); }).concat( Object.keys(manifest.textures || {}).map(function (id) { return TexturePromise(manifest.textures[id]); }),

			// generate all posters
			Object.keys(manifest.posters || {}).map(function (id) { return PosterPromise(manifest.posters[id]); })
		))

		.then(function () {
			// populate payload from cache
			var payload = {models: {}, textures: {}, posters: {}};

			for(var i in manifest.models){
				var url = manifest.models[i];
				var t = cache.models[url];
				payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
			}

			for(var i$1 in manifest.textures){
				var url$1 = manifest.textures[i$1];
				var t$1 = cache.textures[url$1];
				payload.textures[i$1] = t$1 ? singletons[url$1] ? t$1 : t$1.clone() : null;
			}

			for(var i$2 in manifest.posters){
				var url$2 = manifest.posters[i$2];
				var t$2 = cache.posters[url$2];
				payload.posters[i$2] = t$2 ? singletons[url$2] ? t$2 : t$2.clone() : null;
			}

			resolve(payload);
		})
		.catch(function (e) { return console.error(e.stack); });
	});
};

return Diorama;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxubGV0IGNhY2hlID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxue1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLm1vZGVsc1t1cmxdKXtcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHR9XG5cblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5nbFRGTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKFRIUkVFLkdMVEZMb2FkZXIpe1xuXHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLkdMVEZMb2FkZXIoKTtcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRcdC8qcmVzdWx0LnNjZW5lLnRyYXZlcnNlKChvKSA9PiB7XG5cdFx0XHRcdFx0XHRpZihvLm1hdGVyaWFsICYmIG8ubWF0ZXJpYWwubWFwKVxuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnZmxpcFknLCBvLm1hdGVyaWFsLm1hcC5mbGlwWSk7XG5cdFx0XHRcdFx0fSk7Ki9cblxuXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUubW9kZWxzW3VybF0pO1xuXHRcdFx0XHR9LCAoKSA9PiB7fSwgcmVqZWN0KTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBnbFRGIGxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZigvXFwuZGFlJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5Db2xsYWRhTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXG5cdFx0XHRcdH0sIG51bGwsIHJlamVjdCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgQ29sbGFkYSBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XG5cdFx0XHRcdHJlamVjdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIFRleHR1cmVQcm9taXNlKHVybCl7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHR7XG5cdFx0aWYoY2FjaGUudGV4dHVyZXNbdXJsXSlcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnRleHR1cmVzW3VybF0pO1xuXHRcdGVsc2Uge1xuXHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XG5cdFx0XHRsb2FkZXIubG9hZCh1cmwsIHRleHR1cmUgPT4ge1xuXHRcdFx0XHRjYWNoZS50ZXh0dXJlc1t1cmxdID0gdGV4dHVyZTtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUodGV4dHVyZSk7XG5cdFx0XHR9LCBudWxsLCByZWplY3QpO1xuXHRcdH1cblx0fSk7XG59XG5cbmNsYXNzIFZpZGVvUHJvbWlzZSBleHRlbmRzIFByb21pc2Uge1xuXHRjb25zdHJ1Y3Rvcih1cmwpXG5cdHtcblx0XHQvLyBzdGFydCBsb2FkZXJcblx0XHR2YXIgdmlkU3JjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcblx0XHR2aWRTcmMuYXV0b3BsYXkgPSB0cnVlO1xuXHRcdHZpZFNyYy5sb29wID0gdHJ1ZTtcblx0XHR2aWRTcmMuc3JjID0gdXJsO1xuXHRcdHZpZFNyYy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodmlkU3JjKTtcblxuXHRcdHZhciB0ZXggPSBuZXcgVEhSRUUuVmlkZW9UZXh0dXJlKHZpZFNyYyk7XG5cdFx0dGV4Lm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcblx0XHR0ZXgubWFnRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuXHRcdHRleC5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG5cblx0XHQvL2NhY2hlLnZpZGVvc1t1cmxdID0gdGV4O1xuXHRcdC8vcGF5bG9hZC52aWRlb3NbaWRdID0gY2FjaGUudmlkZW9zW3VybF07XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRleCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gUG9zdGVyUHJvbWlzZSh1cmwpe1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLnBvc3RlcnNbdXJsXSlcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XG5cdFx0ZWxzZSByZXR1cm4gKG5ldyBUZXh0dXJlUHJvbWlzZSh1cmwpKS50aGVuKHRleCA9PlxuXHRcdFx0e1xuXHRcdFx0XHRsZXQgcmF0aW8gPSB0ZXguaW1hZ2Uud2lkdGggLyB0ZXguaW1hZ2UuaGVpZ2h0O1xuXHRcdFx0XHRsZXQgZ2VvLCBtYXQgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe21hcDogdGV4LCBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlfSk7XG5cblx0XHRcdFx0aWYocmF0aW8gPiAxKXtcblx0XHRcdFx0XHRnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgxLCAxL3JhdGlvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShyYXRpbywgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYWNoZS5wb3N0ZXJzW3VybF0gPSBuZXcgVEhSRUUuTWVzaChnZW8sIG1hdCk7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59XG5cbmV4cG9ydCB7IE1vZGVsUHJvbWlzZSwgVGV4dHVyZVByb21pc2UsIFZpZGVvUHJvbWlzZSwgUG9zdGVyUHJvbWlzZSwgY2FjaGUgYXMgX2NhY2hlIH07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdDYW1lcmEgZXh0ZW5kcyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmFcbntcblx0Y29uc3RydWN0b3IoZm9jdXMsIHZpZXdTaXplLCBsb29rRGlyZWN0aW9uKVxuXHR7XG5cdFx0c3VwZXIoLTEsIDEsIDEsIC0xLCAuMSwgNDAwKTtcblxuXHRcdGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycpO1xuXHRcdGlmKHNldHRpbmdzKXtcblx0XHRcdHNldHRpbmdzID0gSlNPTi5wYXJzZShzZXR0aW5ncyk7XG5cdFx0XHRpZighZm9jdXMpXG5cdFx0XHRcdGZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MuZm9jdXMpO1xuXHRcdFx0aWYoIXZpZXdTaXplKVxuXHRcdFx0XHR2aWV3U2l6ZSA9IHNldHRpbmdzLnZpZXdTaXplO1xuXHRcdFx0aWYoIWxvb2tEaXJlY3Rpb24pXG5cdFx0XHRcdGxvb2tEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5sb29rRGlyZWN0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZpZXdTaXplIHx8IDQwO1xuXHRcdHRoaXMuX2ZvY3VzID0gZm9jdXMgfHwgbmV3IFRIUkVFLlZlY3RvcjMoKTtcblx0XHR0aGlzLl9sb29rRGlyZWN0aW9uID0gbG9va0RpcmVjdGlvbiB8fCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApO1xuXHRcdHRoaXMuZ3JpZEhlbHBlciA9IG5ldyBUSFJFRS5HcmlkSGVscGVyKDMwMCwgMSk7XG5cdFx0dGhpcy5ncmlkSGVscGVyLnVzZXJEYXRhID0ge2FsdHNwYWNlOiB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19fTtcblx0XHQvL3RoaXMuZ3JpZEhlbHBlci5xdWF0ZXJuaW9uLnNldEZyb21Vbml0VmVjdG9ycyggbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSwgdGhpcy5fbG9va0RpcmVjdGlvbiApO1xuXHR9XG5cblx0Z2V0IHZpZXdTaXplKCl7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdTaXplO1xuXHR9XG5cdHNldCB2aWV3U2l6ZSh2YWwpe1xuXHRcdHRoaXMuX3ZpZXdTaXplID0gdmFsO1xuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcblx0fVxuXG5cdGdldCBmb2N1cygpe1xuXHRcdHJldHVybiB0aGlzLl9mb2N1cztcblx0fVxuXHRzZXQgZm9jdXModmFsKXtcblx0XHR0aGlzLl9mb2N1cy5jb3B5KHZhbCk7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0Z2V0IGxvb2tEaXJlY3Rpb24oKXtcblx0XHRyZXR1cm4gdGhpcy5fbG9va0RpcmVjdGlvbjtcblx0fVxuXHRzZXQgbG9va0RpcmVjdGlvbih2YWwpe1xuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24uY29weSh2YWwpO1xuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcblx0fVxuXG5cdHJlZ2lzdGVySG9va3MocmVuZGVyZXIpXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5yZW5kZXJlciA9IHJlbmRlcmVyO1xuXG5cdFx0Ly8gc2V0IHN0eWxlcyBvbiB0aGUgcGFnZSwgc28gdGhlIHByZXZpZXcgd29ya3MgcmlnaHRcblx0XHRkb2N1bWVudC5ib2R5LnBhcmVudEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUubWFyZ2luID0gJzAnO1xuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblxuXHRcdHZhciBpbmZvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuXHRcdGluZm8uaW5uZXJIVE1MID0gWydNaWRkbGUgY2xpY2sgYW5kIGRyYWcgdG8gcGFuJywgJ01vdXNlIHdoZWVsIHRvIHpvb20nLCAnQXJyb3cga2V5cyB0byByb3RhdGUnXS5qb2luKCc8YnIvPicpO1xuXHRcdE9iamVjdC5hc3NpZ24oaW5mby5zdHlsZSwge1xuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsXG5cdFx0XHR0b3A6ICcxMHB4Jyxcblx0XHRcdGxlZnQ6ICcxMHB4Jyxcblx0XHRcdG1hcmdpbjogMFxuXHRcdH0pO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5mbyk7XG5cblx0XHQvLyByZXNpemUgdGhlIHByZXZpZXcgY2FudmFzIHdoZW4gd2luZG93IHJlc2l6ZXNcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgZSA9PiBzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCkpO1xuXHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblxuXHRcdC8vIG1pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4gdmlld1xuXHRcdHZhciBkcmFnU3RhcnQgPSBudWxsLCBmb2N1c1N0YXJ0ID0gbnVsbDtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgZSA9PiB7XG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XG5cdFx0XHRcdGRyYWdTdGFydCA9IHt4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WX07XG5cdFx0XHRcdGZvY3VzU3RhcnQgPSBzZWxmLl9mb2N1cy5jbG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgZSA9PiB7XG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XG5cdFx0XHRcdGRyYWdTdGFydCA9IG51bGw7XG5cdFx0XHRcdGZvY3VzU3RhcnQgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBlID0+IHtcblx0XHRcdGlmKGRyYWdTdGFydClcblx0XHRcdHtcblx0XHRcdFx0bGV0IHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XG5cdFx0XHRcdGxldCBwaXhlbHNQZXJNZXRlciA9IE1hdGguc3FydCh3KncraCpoKSAvIHNlbGYuX3ZpZXdTaXplO1xuXHRcdFx0XHRsZXQgZHggPSBlLmNsaWVudFggLSBkcmFnU3RhcnQueCwgZHkgPSBlLmNsaWVudFkgLSBkcmFnU3RhcnQueTtcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XG5cblx0XHRcdFx0c2VsZi5fZm9jdXMuY29weShmb2N1c1N0YXJ0KVxuXHRcdFx0XHRcdC5hZGQoc2VsZi51cC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKGR5L3BpeGVsc1Blck1ldGVyKSlcblx0XHRcdFx0XHQuYWRkKHJpZ2h0Lm11bHRpcGx5U2NhbGFyKC1keC9waXhlbHNQZXJNZXRlcikpO1xuXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIHdoZWVsIHRvIHpvb21cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBlID0+IHtcblx0XHRcdGlmKGUuZGVsdGFZIDwgMCl7XG5cdFx0XHRcdHNlbGYuX3ZpZXdTaXplICo9IDAuOTA7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5kZWx0YVkgPiAwKXtcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMS4xO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBhcnJvdyBrZXlzIHRvIHJvdGF0ZVxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRpZihlLmtleSA9PT0gJ0Fycm93RG93bicpe1xuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCBNYXRoLlBJLzIpO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dVcCcpe1xuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhyaWdodCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93TGVmdCcpe1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1JpZ2h0Jyl7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIE1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlY29tcHV0ZVZpZXdwb3J0KClcblx0e1xuXHRcdHZhciB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xuXG5cdFx0Ly8gcmVzaXplIGNhbnZhc1xuXHRcdHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3LCBoKTtcblxuXHRcdC8vIGNvbXB1dGUgd2luZG93IGRpbWVuc2lvbnMgZnJvbSB2aWV3IHNpemVcblx0XHR2YXIgcmF0aW8gPSB3L2g7XG5cdFx0dmFyIGhlaWdodCA9IE1hdGguc3FydCggKHRoaXMuX3ZpZXdTaXplKnRoaXMuX3ZpZXdTaXplKSAvIChyYXRpbypyYXRpbyArIDEpICk7XG5cdFx0dmFyIHdpZHRoID0gcmF0aW8gKiBoZWlnaHQ7XG5cblx0XHQvLyBzZXQgZnJ1c3RydW0gZWRnZXNcblx0XHR0aGlzLmxlZnQgPSAtd2lkdGgvMjtcblx0XHR0aGlzLnJpZ2h0ID0gd2lkdGgvMjtcblx0XHR0aGlzLnRvcCA9IGhlaWdodC8yO1xuXHRcdHRoaXMuYm90dG9tID0gLWhlaWdodC8yO1xuXG5cdFx0dGhpcy51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG5cblx0XHQvLyB1cGRhdGUgcG9zaXRpb25cblx0XHR0aGlzLnBvc2l0aW9uLmNvcHkodGhpcy5fZm9jdXMpLnN1YiggdGhpcy5fbG9va0RpcmVjdGlvbi5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDIwMCkgKTtcblx0XHRpZiggTWF0aC5hYnMoIHRoaXMuX2xvb2tEaXJlY3Rpb24ubm9ybWFsaXplKCkuZG90KG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCkpICkgPT09IDEgKVxuXHRcdFx0dGhpcy51cC5zZXQoMCwwLDEpOyAvLyBpZiB3ZSdyZSBsb29raW5nIGRvd24gdGhlIFkgYXhpc1xuXHRcdGVsc2Vcblx0XHRcdHRoaXMudXAuc2V0KDAsMSwwKTtcblx0XHR0aGlzLmxvb2tBdCggdGhpcy5fZm9jdXMgKTtcblxuXHRcdHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGZvY3VzOiB0aGlzLl9mb2N1cy50b0FycmF5KCksXG5cdFx0XHR2aWV3U2l6ZTogdGhpcy5fdmlld1NpemUsXG5cdFx0XHRsb29rRGlyZWN0aW9uOiB0aGlzLl9sb29rRGlyZWN0aW9uLnRvQXJyYXkoKVxuXHRcdH0pKTtcblx0fVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgKiBhcyBMb2FkZXJzIGZyb20gJy4vbG9hZGVycyc7XG5pbXBvcnQgUHJldmlld0NhbWVyYSBmcm9tICcuL2NhbWVyYSc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERpb3JhbWFcbntcblx0Y29uc3RydWN0b3Ioe2JnQ29sb3I9MHhhYWFhYWEsIGdyaWRPZmZzZXQ9WzAsMCwwXSwgZnVsbHNwYWNlPWZhbHNlfSA9IHt9KVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHNlbGYuX2NhY2hlID0gTG9hZGVycy5fY2FjaGU7XG5cdFx0c2VsZi5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuXG5cdFx0Ly8gc2V0IHVwIHJlbmRlcmVyIGFuZCBzY2FsZVxuXHRcdGlmKGFsdHNwYWNlLmluQ2xpZW50KVxuXHRcdHtcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBhbHRzcGFjZS5nZXRUaHJlZUpTUmVuZGVyZXIoKTtcblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLmFsbChbYWx0c3BhY2UuZ2V0RW5jbG9zdXJlKCksIGFsdHNwYWNlLmdldFNwYWNlKCldKVxuXHRcdFx0LnRoZW4oKFtlLCBzXSkgPT4ge1xuXG5cdFx0XHRcdGZ1bmN0aW9uIGFkanVzdFNjYWxlKCl7XG5cdFx0XHRcdFx0c2VsZi5zY2VuZS5zY2FsZS5zZXRTY2FsYXIoZS5waXhlbHNQZXJNZXRlcik7XG5cdFx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuYXNzaWduKHt9LCBlLCBzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZGp1c3RTY2FsZSgpO1xuXG5cdFx0XHRcdGlmKGZ1bGxzcGFjZSl7XG5cdFx0XHRcdFx0c2VsZi5fZnNQcm9taXNlID0gZS5yZXF1ZXN0RnVsbHNwYWNlKCkuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybignUmVxdWVzdCBmb3IgZnVsbHNwYWNlIGRlbmllZCcpKTtcblx0XHRcdFx0XHRlLmFkZEV2ZW50TGlzdGVuZXIoJ2Z1bGxzcGFjZWNoYW5nZScsIGFkanVzdFNjYWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0c2VsZi5fZnNQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0ZWxzZVxuXHRcdHtcblx0XHRcdC8vIHNldCB1cCBwcmV2aWV3IHJlbmRlcmVyLCBpbiBjYXNlIHdlJ3JlIG91dCBvZiB3b3JsZFxuXHRcdFx0c2VsZi5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldFNpemUoZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCwgZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQpO1xuXHRcdFx0c2VsZi5yZW5kZXJlci5zZXRDbGVhckNvbG9yKCBiZ0NvbG9yICk7XG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNlbGYucmVuZGVyZXIuZG9tRWxlbWVudCk7XG5cblx0XHRcdHNlbGYucHJldmlld0NhbWVyYSA9IG5ldyBQcmV2aWV3Q2FtZXJhKCk7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlci5wb3NpdGlvbi5mcm9tQXJyYXkoZ3JpZE9mZnNldCk7XG5cdFx0XHRzZWxmLnNjZW5lLmFkZChzZWxmLnByZXZpZXdDYW1lcmEsIHNlbGYucHJldmlld0NhbWVyYS5ncmlkSGVscGVyKTtcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5yZWdpc3Rlckhvb2tzKHNlbGYucmVuZGVyZXIpO1xuXG5cdFx0XHQvLyBzZXQgdXAgY3Vyc29yIGVtdWxhdGlvblxuXHRcdFx0YWx0c3BhY2UudXRpbGl0aWVzLnNoaW1zLmN1cnNvci5pbml0KHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSwge3JlbmRlcmVyOiBzZWxmLnJlbmRlcmVyfSk7XG5cblx0XHRcdC8vIHN0dWIgZW52aXJvbm1lbnRcblx0XHRcdHNlbGYuZW52ID0ge1xuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxuXHRcdFx0XHRpbm5lckhlaWdodDogMTAyNCxcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3Nlcidcblx0XHRcdH07XG5cblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0fVxuXG5cblx0c3RhcnQoLi4ubW9kdWxlcylcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdC8vIGRldGVybWluZSB3aGljaCBhc3NldHMgYXJlbid0IHNoYXJlZFxuXHRcdHZhciBzaW5nbGV0b25zID0ge307XG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxuXHRcdHtcblx0XHRcdGZ1bmN0aW9uIGNoZWNrQXNzZXQodXJsKXtcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XG5cdFx0XHRcdGVsc2UgaWYoc2luZ2xldG9uc1t1cmxdID09PSB0cnVlKSBzaW5nbGV0b25zW3VybF0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLm1vZGVscyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy5tb2RlbHNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnBvc3RlcnMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMucG9zdGVyc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcblx0XHR9KTtcblxuXHRcdC8vIGRldGVybWluZSBpZiB0aGUgdHJhY2tpbmcgc2tlbGV0b24gaXMgbmVlZGVkXG5cdFx0bGV0IG5lZWRzU2tlbGV0b24gPSBtb2R1bGVzLnJlZHVjZSgobnMsbSkgPT4gbnMgfHwgbS5uZWVkc1NrZWxldG9uLCBmYWxzZSk7XG5cdFx0aWYobmVlZHNTa2VsZXRvbiAmJiBhbHRzcGFjZS5pbkNsaWVudCl7XG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IGFsdHNwYWNlLmdldFRocmVlSlNUcmFja2luZ1NrZWxldG9uKCkudGhlbihza2VsID0+IHtcblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQoc2tlbCk7XG5cdFx0XHRcdHNlbGYuZW52LnNrZWwgPSBza2VsO1xuXHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoc2VsZi5lbnYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuZnJlZXplKHNlbGYuZW52KTtcblx0XHRcdHNlbGYuX3NrZWxQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0UHJvbWlzZS5hbGwoW3NlbGYuX2VudlByb21pc2UsIHNlbGYuX2ZzUHJvbWlzZSwgc2VsZi5fc2tlbFByb21pc2VdKS50aGVuKCgpID0+XG5cdFx0e1xuXHRcdFx0Ly8gY29uc3RydWN0IGRpb3JhbWFzXG5cdFx0XHRtb2R1bGVzLmZvckVhY2goZnVuY3Rpb24obW9kdWxlKVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQgcm9vdCA9IG51bGw7XG5cblx0XHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0Qpe1xuXHRcdFx0XHRcdHJvb3QgPSBtb2R1bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cm9vdCA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xuXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIGFic29sdXRlIHBvc2l0aW9uaW5nXG5cdFx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5kZWNvbXBvc2Uocm9vdC5wb3NpdGlvbiwgcm9vdC5xdWF0ZXJuaW9uLCByb290LnNjYWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucG9zaXRpb24pe1xuXHRcdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYobW9kdWxlLnJvdGF0aW9uKXtcblx0XHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBoYW5kbGUgcmVsYXRpdmUgcG9zaXRpb25pbmdcblx0XHRcdFx0aWYobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xuXHRcdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xuXHRcdFx0XHRcdHN3aXRjaChtb2R1bGUudmVydGljYWxBbGlnbil7XG5cdFx0XHRcdFx0Y2FzZSAndG9wJzpcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2JvdHRvbSc6XG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbWlkZGxlJzpcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQocm9vdCk7XG5cblx0XHRcdFx0aWYoc2VsZi5wcmV2aWV3Q2FtZXJhKXtcblx0XHRcdFx0XHRsZXQgYXhpcyA9IG5ldyBUSFJFRS5BeGlzSGVscGVyKDEpO1xuXHRcdFx0XHRcdGF4aXMudXNlckRhdGEuYWx0c3BhY2UgPSB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19O1xuXHRcdFx0XHRcdHJvb3QuYWRkKGF4aXMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VsZi5sb2FkQXNzZXRzKG1vZHVsZS5hc3NldHMsIHNpbmdsZXRvbnMpLnRoZW4oKHJlc3VsdHMpID0+IHtcblx0XHRcdFx0XHRtb2R1bGUuaW5pdGlhbGl6ZShzZWxmLmVudiwgcm9vdCwgcmVzdWx0cyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBzdGFydCBhbmltYXRpbmdcblx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uIGFuaW1hdGUodGltZXN0YW1wKVxuXHRcdHtcblx0XHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XG5cdFx0XHRzZWxmLnNjZW5lLnVwZGF0ZUFsbEJlaGF2aW9ycygpO1xuXHRcdFx0aWYod2luZG93LlRXRUVOKSBUV0VFTi51cGRhdGUoKTtcblx0XHRcdHNlbGYucmVuZGVyZXIucmVuZGVyKHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSk7XG5cdFx0fSk7XG5cdH1cblxuXHRsb2FkQXNzZXRzKG1hbmlmZXN0LCBzaW5nbGV0b25zKVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG5cdFx0e1xuXHRcdFx0Ly8gcG9wdWxhdGUgY2FjaGVcblx0XHRcdFByb21pc2UuYWxsKFtcblxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBtb2RlbCBjYWNoZVxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC5tb2RlbHMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLk1vZGVsUHJvbWlzZShtYW5pZmVzdC5tb2RlbHNbaWRdKSksXG5cblx0XHRcdFx0Ly8gcG9wdWxhdGUgZXhwbGljaXQgdGV4dHVyZSBjYWNoZVxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC50ZXh0dXJlcyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuVGV4dHVyZVByb21pc2UobWFuaWZlc3QudGV4dHVyZXNbaWRdKSksXG5cblx0XHRcdFx0Ly8gZ2VuZXJhdGUgYWxsIHBvc3RlcnNcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QucG9zdGVycyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuUG9zdGVyUHJvbWlzZShtYW5pZmVzdC5wb3N0ZXJzW2lkXSkpXG5cdFx0XHRdKVxuXG5cdFx0XHQudGhlbigoKSA9PlxuXHRcdFx0e1xuXHRcdFx0XHQvLyBwb3B1bGF0ZSBwYXlsb2FkIGZyb20gY2FjaGVcblx0XHRcdFx0dmFyIHBheWxvYWQgPSB7bW9kZWxzOiB7fSwgdGV4dHVyZXM6IHt9LCBwb3N0ZXJzOiB7fX07XG5cblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0Lm1vZGVscyl7XG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0Lm1vZGVsc1tpXTtcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLm1vZGVsc1t1cmxdO1xuXHRcdFx0XHRcdHBheWxvYWQubW9kZWxzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnRleHR1cmVzKXtcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QudGV4dHVyZXNbaV07XG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS50ZXh0dXJlc1t1cmxdO1xuXHRcdFx0XHRcdHBheWxvYWQudGV4dHVyZXNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QucG9zdGVycyl7XG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnBvc3RlcnNbaV07XG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5wb3N0ZXJzW3VybF07XG5cdFx0XHRcdFx0cGF5bG9hZC5wb3N0ZXJzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzb2x2ZShwYXlsb2FkKTtcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUuc3RhY2spKTtcblx0XHR9KTtcblx0fVxuXG59O1xuIl0sIm5hbWVzIjpbImxldCIsImxvYWRlciIsInN1cGVyIiwicmlnaHQiLCJMb2FkZXJzLl9jYWNoZSIsIkxvYWRlcnMuTW9kZWxQcm9taXNlIiwiTG9hZGVycy5UZXh0dXJlUHJvbWlzZSIsIkxvYWRlcnMuUG9zdGVyUHJvbWlzZSIsImkiLCJ1cmwiLCJ0Il0sIm1hcHBpbmdzIjoiOzs7QUFFQUEsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDOztBQUVwRCxTQUFTLFlBQVksQ0FB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
