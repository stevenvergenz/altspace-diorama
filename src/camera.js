'use strict';

Diorama.PreviewCamera = class PreviewCamera extends THREE.OrthographicCamera
{
	constructor(focus = new THREE.Vector3(), viewSize = 40, lookDirection = new THREE.Vector3(0,-1,0))
	{
		super(-1, 1, 1, -1, .1, 400);

		this._viewSize = viewSize;
		this._focus = focus;
		this._lookDirection = lookDirection;
		this.gridHelper = new THREE.GridHelper(300, 1);
	}

	get viewSize(){
		return this._viewSize;
	}
	set viewSize(val){
		this._viewSize = val;
		this.recomputeViewport();
	}

	get focus(){
		return this._focus;
	}
	set focus(val){
		this._focus.copy(val);
		this.recomputeViewport();
	}

	get lookDirection(){
		return this._lookDirection;
	}
	set lookDirection(val){
		this._lookDirection.copy(val);
		this.recomputeViewport();
	}

	registerHooks(renderer)
	{
		var self = this;
		self.renderer = renderer;

		// set styles on the page, so the preview works right
		document.body.parentElement.style.height = '100%';
		document.body.style.height = '100%';
		document.body.style.margin = '0';
		document.body.style.overflow = 'hidden';

		// resize the preview canvas when window resizes
		window.addEventListener('resize', e => self.recomputeViewport());
		self.recomputeViewport();

		// middle click and drag to pan view
		var dragStart = null, focusStart = null;
		window.addEventListener('mousedown', e => {
			if(e.button === 1){
				dragStart = {x: e.clientX, y: e.clientY};
				focusStart = self._focus.clone();
			}
		});
		window.addEventListener('mouseup', e => {
			if(e.button === 1){
				dragStart = null;
				focusStart = null;
			}
		});
		window.addEventListener('mousemove', e => {
			if(dragStart)
			{
				let {clientWidth: w, clientHeight: h} = document.body;
				let pixelsPerMeter = Math.sqrt(w*w+h*h) / self._viewSize;
				let dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
				let right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);

				self._focus.copy(focusStart)
					.add(self.up.clone().multiplyScalar(dy/pixelsPerMeter))
					.add(right.multiplyScalar(-dx/pixelsPerMeter));

				self.recomputeViewport();
			}
		});

		// wheel to zoom
		window.addEventListener('wheel', e => {
			if(e.deltaY < 0){
				self._viewSize *= 0.95;
				self.recomputeViewport();
			}
			else if(e.deltaY > 0){
				self._viewSize *= 1.05;
				self.recomputeViewport();
			}
		});

		// arrow keys to rotate
		window.addEventListener('keydown', e => {
			if(e.key === 'ArrowDown'){
				let right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right, Math.PI/2);
				self.gridHelper.rotateOnAxis(right, Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowUp'){
				let right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right, -Math.PI/2);
				self.gridHelper.rotateOnAxis(right, -Math.PI/2);
				self.recomputeViewport();
				
			}
			else if(e.key === 'ArrowLeft'){
				self._lookDirection.applyAxisAngle(self.up, -Math.PI/2);
				self.gridHelper.rotateOnAxis(self.up, -Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowRight'){
				self._lookDirection.applyAxisAngle(self.up, Math.PI/2);
				self.gridHelper.rotateOnAxis(self.up, Math.PI/2);
				self.recomputeViewport();
			}
		});
	}

	recomputeViewport()
	{
		var {clientWidth: w, clientHeight: h} = document.body;

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
			this.up.set(0,0,1); // if we're looking down the Y axis
		else
			this.up.set(0,1,0);
		this.lookAt( this._focus );
	}
}
