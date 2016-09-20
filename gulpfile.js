const gulp = require('gulp'),
	concat = require('gulp-concat'),
	uglify = require('gulp-uglify'),
	babel = require('gulp-babel'),
	rename = require('gulp-rename'),
	pump = require('pump');

gulp.task('default', function(cb){
	pump([
		gulp.src(['./src/main.js','./src/loader.js']),
		babel({presets: ['es2015']}),
		concat('diorama.js'),
		gulp.dest('./dist/'),

		uglify(),
		rename('diorama.min.js'),
		gulp.dest('./dist/')
	],
	cb, function(err){
		if(err) console.error(err);
	});
});
