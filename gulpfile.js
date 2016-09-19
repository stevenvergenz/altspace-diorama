const gulp = require('gulp'),
	concat = require('gulp-concat'),
	uglify = require('gulp-uglify'),
	babel = require('gulp-babel'),
	rename = require('gulp-rename'),
	pump = require('pump');

gulp.task('default', function(cb){
	pump([
		gulp.src('./src/*.js'),
		babel({presets: ['es2015']}),
		concat('diorama.js'),
	
		rename('diorama.min.js'),
		uglify(),

		gulp.dest('./bin/')
	],
	cb, function(err){
		if(err) console.error(err);
	});
});
