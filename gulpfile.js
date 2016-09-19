const gulp = require('gulp'),
	concat = require('gulp-concat'),
	uglify = require('gulp-uglify'),
	babel = require('gulp-babel'),
	pump = require('pump');

gulp.task('default', function(cb){
	pump([
		gulp.src('./src/*.js'),
		babel({presets: ['es2015']}),
		concat('diorama.js'),
		uglify(),
		gulp.dest('./bin/')
	],
	cb, function(err){
		console.error(err);
	});
});
