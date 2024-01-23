import Fastify from "fastify";
import fs from "fs";
import { exec } from 'child_process';
import util from "util";
import AdmZip from 'adm-zip';
import path from "path";

const execPromise = util.promisify(exec);

const fastify = Fastify();

const gitOperation = async (url:string,destinationFolder:string) => {
    if (!fs.existsSync(destinationFolder)) {
        const {stdout,stderr}=await execPromise(`git clone --progress --verbose ${url} ${destinationFolder}`);
        console.log(stdout);
        console.log(stderr);
    } else {
        const {stdout,stderr}=await execPromise(`git -C ${destinationFolder} pull --progress --verbose ${url}`);
        console.log(stdout);
        console.log(stderr);
    }
};

const runJavaJarCommand = async(proxyUrl, proxyUsername, proxyPassword)=>{
    let cmd:string;
    if(proxyUrl!=null)
    {
        cmd=`java -DproxyUrl=${proxyUrl} -DproxyUsername=${proxyUsername} -DproxyPassword=${proxyPassword} -jar karate.jar ./feature-files-repo/Feature-files`;
    }
    else
    {
        cmd=`java -jar karate.jar ./feature-files-repo/Feature-files`;
    }
    try {
        const { stdout, stderr } = await execPromise(cmd);
        console.log(stdout);
        console.log(stderr);
        return {
            success: true,
            output: stdout,
            error: stderr
        };
    } catch (error) {
        console.error('Error during Java execution:', error);
        throw error; 
    }
}

const zipDirectory = async (sourceDir, outputFilePath) => {
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    await zip.writeZipPromise(outputFilePath);
    console.log(`Zip file created: ${outputFilePath}`);
};

fastify.post('/getReport', async (req, reply) => {
    const jsonData:any= req.body;
    const url:string=jsonData.url;
    let proxyUrl:string, proxyUsername:String, proxyPassword:String;
    if(jsonData.proxy){
        proxyUrl=jsonData.proxy.url;
        proxyUsername=jsonData.proxy.username;
        proxyPassword=jsonData.proxy.password;
    }
    else{
        proxyUrl=null;
        proxyUsername=null;
        proxyPassword=null;
    }
    const destinationFolder="feature-files-repo";
    try {
        await gitOperation(url,destinationFolder);
        const javaCommandResult = await runJavaJarCommand(proxyUrl, proxyUsername, proxyPassword);
        fs.rm('feature-files-repo',{ recursive: true, force: true },(err)=>{
            if(err){
            console.log(err);
            }
        })
        await zipDirectory("./target/karate-reports","./report.zip");
        const zipFilePath="./report.zip";
        if(!fs.existsSync(zipFilePath)){
            return reply.status(404).send({ error: 'File not found' });
        }
        if(jsonData.requestReport){
        const zipFileBuffer = fs.readFileSync(zipFilePath);
        reply
            .header('Content-Type', 'application/zip')
            .header('Content-Disposition', `attachment; filename=${path.basename(zipFilePath)}`)
            .send(zipFileBuffer);
        }
        else{
            if (javaCommandResult.success) {
                const formattedOutput = javaCommandResult.output
                    .replace(/\r\n/g, '\n');  
                reply.type('text/html');
                reply.send(formattedOutput);
            } else {
                reply.status(500).send(`Error: ${javaCommandResult.error}`);
            }
        }
    } catch (error) {
        console.error('Error during processing:', error);
        reply.status(500).send('Error during processing');
    }
});

fastify.listen({ port: 8000 }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`server listening at ${address}`);
})