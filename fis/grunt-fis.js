// TODO debug模式保存导出log
module.exports = function(debug) {
    var grunt = require('grunt')
    debug = !!debug

    // init fis
    require('./fis-conf')(
        grunt.config.get('webappRoot'),
        grunt.config.get('entry_files')
    )

    var done = this.async()
    var total = {}
    var modified = {}
    var lastModified = {}
    var options = {}
    var duration = function (ms) {
        return ms > 999 ? ((ms / 1000).toFixed(2) + 's') : (ms + 'ms');
    }

    // 调试信息设置，从fis3-command-release里抄出来的
    var stream = process.stdout;
    var alertDurtion = 1000; // 1s
    var alertCacheDurtion = 200; // 200ms

    if (debug) {
        fis.log.level = fis.log.L_ALL
        // 清除所有缓存，debug模式下才启动，不然每次构建运行时间太长
        stream.write('\n 清理缓存 '.bold.yellow);
        var now = Date.now();
        fis.cache.clean();
        stream.write((Date.now() - now + 'ms').green.bold);
        stream.write('\n');
    }

    stream.write('\n 构建开始 '.green.bold)
    options.beforeEach = function(file) {
        if (file.isPartial)return;
        file._start = Date.now(); // 记录起点
        file.release !== false && (total[file.subpath] = file);
        file._fromCache = true;
    };

    options.beforeCompile = function(file) {
        if (file.isPartial)return;
        file._fromCache = false;
        file.release !== false && (modified[file.subpath] = file);
    };

    options.afterEach = function(file) {
        if (file.isPartial)return;
        var mtime = file.getMtime().getTime();
        var fromCache = file._fromCache;

        if (file.release && (!fromCache || lastModified[file.subpath] !== mtime)) {
            var cost = Date.now() - file._start;
            var flag = fromCache ? (cost > alertCacheDurtion ? '.'.bold.yellow : '.'.grey) : (cost > alertDurtion ? '.'.bold.yellow : '.');
            lastModified[file.subpath] = mtime;
            modified[file.subpath] = file;
            debug ? fis.log.debug(file.realpath) : stream.write(flag);
        }
    };

    // 正式的release开始，fis3的release入口是fis3-command-release，除了正式的release流程，
    // 还有deploy和live的过程，这里使用了fis3-command-release的deploy过程，自定义了deploy之后的操作
    var start = Date.now();
    fis.release(options, function(ret){
        stream.write(fis.log.format('%s%s'.bold.green, debug ? '' : ' ', duration(Date.now() - start)));

        fis.util.map(ret.pkg, function(subpath, file) {
            modified[subpath] = file;
            total[subpath] = file;
        });

        var deploy = require('./deploy')

        deploy({
            options: options,
            modified: modified,
            total: total,
            map: ret.map,
            pkg: ret.pkg
        }, function () {
            if (debug) {
                var temp = {}
                fis.util.each(ret.src, function(v, i) {
                    delete v._content
                    temp[i] = v
                })
                ret.src = temp
                temp = {}
                fis.util.each(ret.pkg, function(v, i) {
                    delete v._content
                    temp[i] = v
                })
                ret.pkg = temp
                grunt.file.write('map.json', JSON.stringify(ret, null, "\t"))
            }
            done();
        })
    })
}