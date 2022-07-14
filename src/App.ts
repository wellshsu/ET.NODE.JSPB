import * as fs from "fs"
import * as path from "path"
import * as rd from "rd"
import * as child_process from "child_process"
setTimeout(() => { }, 2000) // 延时退出，查看日志
let root = process.argv[2]
if (root == null) root = process.cwd() // 使用当前目录
process.stdout.write("working root: " + root)
process.stdout.write("\n")
try {
    // 编译header文件
    rd.eachFileFilterSync(root, /\.h$/, (f) => {
        let name = path.basename(f).replace(path.extname(f), "")
        let js = path.join(path.dirname(f), name + ".js")
        let ctt = fs.readFileSync(f, "utf-8")
        let lines = ctt.split("\n")
        let tjs = ""
        let lastEnumIndex = -1
        let beginParse = false
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim()
            if (line.startsWith("enum")) {
                if (beginParse) tjs += "})\n"
                let structName = line.replace("\t", "").replace(" ", "").replace("{", "")
                let index = structName.indexOf("/")
                if (index > 0) structName = structName.substring(0, index)
                structName = structName.replace("/", "")
                structName = structName.substring(4, structName.length)
                if (tjs == "") { // 第一个枚举类型使用默认导出
                    tjs += "export default Object.freeze({\n"
                } else {
                    tjs += "export const " + structName + " = Object.freeze({\n"
                }
                beginParse = true
                lastEnumIndex = -1
                continue
            }
            if (line.startsWith("/") || line == ""
                || line.startsWith("{") || line.startsWith("}")
                || line.replace(" ", "").startsWith("*") || line.replace(" ", "").startsWith("/")
                || beginParse == false) {
                continue
            }
            let comment = ""
            let enumName = line.replace("\t", "").replace(" ", "")
            if (enumName == "") continue
            let index1 = enumName.indexOf("/")
            if (index1 == 0) continue
            if (index1 > 0) {
                comment = enumName.substring(index1, enumName.length)
                enumName = enumName.substring(0, index1)
            }
            enumName = enumName.replace("/", "")

            let enumIndex = 0
            let index2 = enumName.indexOf("=")
            let index3 = enumName.indexOf(",")
            if (index2 > 0) {
                let enumIndexStr = enumName.substring(index2 + 1, index3 - index2 - 1)
                enumIndexStr = enumIndexStr.replace(" ", "")
                try {
                    enumIndex = parseInt(enumIndexStr)
                    enumName = enumName.substring(0, index2)
                }
                catch
                {
                    continue // ref enum value.
                }
            }
            else {
                enumIndex = lastEnumIndex + 1
            }
            lastEnumIndex = enumIndex
            enumName = enumName.replace(",", "")
            if (comment != "") {
                tjs += "\t" + enumName + " : " + enumIndex + ", " + comment + "\n"
            } else {
                tjs += "\t" + enumName + " : " + enumIndex + ",\n"
            }
        }
        tjs += "})"
        fs.writeFileSync(js, tjs)
        process.stdout.write("converted: " + js)
        process.stdout.write("\n")
    })

    // 编译proto文件
    rd.eachFileFilterSync(root, /\.proto$/, (f) => {
        let name = path.basename(f).replace(path.extname(f), "")
        let js = path.join(path.dirname(f), name + ".js")
        child_process.execSync("pbjs " + f + " --es6 " + js)
        let ctt = fs.readFileSync(f, "utf-8")
        let lines = ctt.split("\n")
        let tjs = ""
        let mname = ""
        let comment = ""
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            line = line.trim()
            if (line.startsWith("//")) {
                comment = line
            } else if (line.startsWith("message ")) {
                mname = line.split("/")[0].replace("message ", "").replace(/ /g, "").replace(/\t/g, "").replace("{", "")
                if (comment != "") {
                    tjs += comment + "\n"
                    comment = ""
                }
                tjs += "export class " + mname + " {\n"
            } else if (line.startsWith("required") ||
                line.startsWith("optional") ||
                line.startsWith("repeated")) {
                line = line.replace(/\t/g, " ").replace(/  /g, " ").replace(/   /g, " ").replace(/    /g, " ").replace(/     /g, " ").replace(/      /g, " ")
                let ss = line.split("=")
                let s0 = ss[0].trim()
                let aa = s0.split(" ")
                let opt = aa[0]
                let type = aa[1]
                let id = aa[2]

                let s1 = ss[1].trim()
                let sss = s1.split(";")
                let idx = sss[0]
                let cmt = sss[1]
                if (cmt && cmt != "") {
                    tjs += "\t" + id + " // [opt-" + opt + "][type-" + type + "][idx-" + idx + "]" + cmt + "\n"
                } else {
                    tjs += "\t" + id + " // [opt-" + opt + "][type-" + type + "][idx-" + idx + "]\n"
                }
            } else if (line.startsWith("}")) {
                if (mname != "") {
                    tjs += "\tconstructor(buf) { if (buf) this.Decode(buf) }\n"
                    tjs += "\tEncode = function () {\n"
                    tjs += "\t\tif (window.USE_PB) {\n"
                    tjs += "\t\t\treturn Buffer.from(encode" + mname + "(this))\n"
                    tjs += "\t\t} else {\n"
                    tjs += "\t\t\treturn JSON.stringify(this)\n"
                    tjs += "\t\t}\n"
                    tjs += "\t}\n"

                    tjs += "\tDecode = function (buf) {\n"
                    tjs += "\t\tlet obj = null\n"
                    tjs += "\t\tif (window.USE_PB) {\n"
                    tjs += "\t\t\tif (buf instanceof ArrayBuffer) buf = Buffer.from(buf)\n"
                    tjs += "\t\t\tobj = decode" + mname + "(buf)\n"
                    tjs += "\t\t} else {\n"
                    tjs += "\t\t\tif (buf instanceof ArrayBuffer) buf = String.fromCharCode.apply(null, Buffer.from(buf))\n"
                    tjs += "\t\t\telse if (buf instanceof Buffer) buf = String.fromCharCode.apply(null, buf)\n"
                    tjs += "\t\t\tobj = JSON.parse(buf)\n"
                    tjs += "\t\t}\n"
                    tjs += "\t\tfor (let k in obj) { this[k] = obj[k] }\n"
                    tjs += "\t}\n"
                }
                tjs += "}\n"
            }
        }
        fs.appendFileSync(js, tjs)
        process.stdout.write("compiled: " + js)
        process.stdout.write("\n")
    })
} catch (err) {
    process.stdout.write(err)
    process.stdout.write("\n")
}