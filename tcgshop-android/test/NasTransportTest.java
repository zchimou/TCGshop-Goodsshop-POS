import com.tcgshop.pos.NasTransport;
import org.json.JSONObject;
import java.util.concurrent.*;
public class NasTransportTest {
 static NasTransport client=new NasTransport();
 static JSONObject request(String base,String path,String method,String token,String tag,String body)throws Exception{CountDownLatch done=new CountDownLatch(1);JSONObject[] value={null};client.request(base,path,method,token,tag,body,r->{value[0]=r;done.countDown();});if(!done.await(25,TimeUnit.SECONDS))throw new AssertionError("timeout");return value[0];}
 static void status(JSONObject r,int n){if(!Integer.valueOf(n).equals(r.get("status")))throw new AssertionError(r.toString());}
 static void failure(JSONObject r,String text){if(r.get("error")==null||!r.get("error").toString().contains(text))throw new AssertionError(r.toString());}
 public static void main(String[] args)throws Exception{try{String base=args[0],token=args[1];status(request(base,"/api/health","GET",token,"",""),200);status(request(base,"/api/shop","GET",token,"",""),200);status(request(base,"/api/shop","GET","wrong-key-long-enough","",""),401);status(request(base,"/api/shop","PUT",token,"bad-tag","{}"),400);failure(request("http://example.invalid","/api/health","GET",token,"",""),"HTTPS");failure(request(base,"/api/backup","GET",token,"",""),"不支持");failure(request(base,"/api/health","GET",token,"bad\r\nheader",""),"版本标识");failure(request(args[2],"/api/health","GET",token,"",""),"重定向");System.out.println("PASS: production Java NAS transport over actual local HTTP, health/read, unauthorized response, invalid payload, private-HTTP restrictions, path/header checks, rejected redirects.");}finally{client.close();}}
}
