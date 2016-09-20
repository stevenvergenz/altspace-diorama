'use strict';

Diorama.PreviewCamera = class PreviewCamera extends THREE.OrthographicCamera
{
	constructor(focus = new THREE.Vector3(), viewSize = 20, lookDirection = new THREE.Vector3(0,-1,0))
	{
		super(-1, 1, 1, -1, .1, 400);

		this._viewSize = viewSize;
		this._focus = focus;
		this._lookDirection = lookDirection;
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
		this.renderer = renderer;
		document.body.style.margin = '0';

		this.recomputeViewport();
	}

	recomputeViewport()
	{
		// resize canvas
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		// compute window dimensions from view size
		var ratio = window.innerWidth / window.innerHeight;
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
