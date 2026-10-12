package com.tcgshop.pos;

import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import org.json.JSONObject;

/** Restricted sync bridge; WebView itself still cannot navigate or fetch outside local assets. */
public final class NasTransport {
    public interface Reply {void accept(JSONObject result);}
    private final ThreadPoolExecutor worker=new ThreadPoolExecutor(2,2,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<Runnable>(8));
    private final ThreadPoolExecutor events=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<Runnable>(2));
    private final java.util.Set<HttpURLConnection> active=ConcurrentHashMap.newKeySet();
    private static final int LIMIT=20*1024*1024;
    public void close(){worker.shutdownNow();events.shutdownNow();for(HttpURLConnection connection:active)connection.disconnect();active.clear();}
    private static JSONObject failure(String message){JSONObject r=new JSONObject();try{r.put("error",message);}catch(Exception ignored){}return r;}
    public void request(String base,String path,String method,String token,String etag,String body,Reply reply){
        request(base,path,method,token,etag,body,false,reply);
    }
    public void request(String base,String path,String method,String token,String etag,String body,boolean compress,Reply reply){
        try{("/api/events".equals(path)?events:worker).execute(()->{HttpURLConnection connection=null;try{
            URI uri=new URI(base);String host=uri.getHost(),scheme=uri.getScheme();
            if(host==null||!("https".equals(scheme)||"http".equals(scheme))||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null)throw new IOException("NAS 地址格式不正确");
            if("http".equals(scheme)&&!host.matches("localhost|127\\.0\\.0\\.1|10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}"))throw new IOException("外网同步请使用 HTTPS");
            boolean image=path!=null&&path.matches("/api/images/[a-f0-9]{64}");
            if(!("/api/health".equals(path)||"/api/shop".equals(path)||"/api/changes".equals(path)||"/api/events".equals(path)||image)||!("GET".equals(method)||"PUT".equals(method))||("PUT".equals(method)&&!("/api/shop".equals(path)||"/api/changes".equals(path)||image)))throw new IOException("不支持的同步请求");
            if(token==null||token.length()<16||token.length()>512||token.indexOf('\r')>=0||token.indexOf('\n')>=0)throw new IOException("同步密钥格式不正确");
            if(etag==null||etag.length()>100||etag.indexOf('\r')>=0||etag.indexOf('\n')>=0)throw new IOException("版本标识格式不正确");
            byte[] bytes=body==null?new byte[0]:body.getBytes(StandardCharsets.UTF_8);if(bytes.length>LIMIT)throw new IOException("数据超过 20MB");
            boolean zipped=false;if(compress&&"PUT".equals(method)&&bytes.length>1024){ByteArrayOutputStream packed=new ByteArrayOutputStream();try(GZIPOutputStream gzip=new GZIPOutputStream(packed)){gzip.write(bytes);}if(packed.size()<bytes.length){bytes=packed.toByteArray();zipped=true;}}
            connection=(HttpURLConnection)new URL(base.replaceAll("/+$","")+path).openConnection();active.add(connection);connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setUseCaches(false);connection.setRequestMethod(method);connection.setRequestProperty("Authorization","Bearer "+token);
            connection.setRequestProperty("Accept-Encoding","gzip");
            if("GET".equals(method)&&!etag.isEmpty())connection.setRequestProperty("If-None-Match",etag);
            if("PUT".equals(method)){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("If-Match",etag);if(zipped)connection.setRequestProperty("Content-Encoding","gzip");connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}}
            int status=connection.getResponseCode();if(status>=300&&status<400&&status!=304)throw new IOException("NAS 返回重定向，请填写最终服务地址");
            if(connection.getContentLengthLong()>LIMIT)throw new IOException("NAS 数据超过 20MB");InputStream stream=status==304?null:status>=400?connection.getErrorStream():connection.getInputStream();ByteArrayOutputStream buffer=new ByteArrayOutputStream();if(stream!=null){try(InputStream rawStream=stream;InputStream in="gzip".equalsIgnoreCase(connection.getContentEncoding())?new GZIPInputStream(rawStream):rawStream){byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(buffer.size()+n>LIMIT)throw new IOException("NAS 数据超过 20MB");buffer.write(chunk,0,n);}}}
            JSONObject result=new JSONObject();result.put("status",status);result.put("etag",connection.getHeaderField("ETag"));String raw=buffer.toString("UTF-8");result.put("body",status==304||"null".equals(raw)?JSONObject.NULL:new JSONObject(raw));reply.accept(result);
        }catch(Exception e){reply.accept(failure(e instanceof SocketTimeoutException?"连接超时，数据保留本机":e instanceof javax.net.ssl.SSLException?"HTTPS 证书校验失败，请检查 NAS 证书":"无法连接 NAS："+(e.getMessage()==null?"网络错误":e.getMessage())));}finally{if(connection!=null){active.remove(connection);connection.disconnect();}}});
        }catch(RejectedExecutionException e){reply.accept(failure("同步请求繁忙，请稍后重试"));}
    }
}
