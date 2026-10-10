import com.tcgshop.pos.NasTransport;
import org.json.JSONObject;
import java.util.concurrent.*;
public class NasCompressionTest {
 static NasTransport client=new NasTransport();
 static JSONObject call(String base,String method,String tag,String body,boolean gzip)throws Exception{
  CountDownLatch done=new CountDownLatch(1);JSONObject[] out={null};client.request(base,"/api/shop",method,"test-compression-token",tag,body,gzip,r->{out[0]=r;done.countDown();});
  if(!done.await(25,TimeUnit.SECONDS))throw new AssertionError("timeout");return out[0];
 }
 static void ok(JSONObject r,int status){if(!Integer.valueOf(status).equals(r.get("status")))throw new AssertionError(r.toString());}
 public static void main(String[] args)throws Exception{try{
  JSONObject r=call(args[0],"GET","","",false);ok(r,200);if(!r.get("body").toString().contains("gzip-roundtrip"))throw new AssertionError(r.toString());
  r=call(args[0],"GET","\"native-test\"","",false);ok(r,304);if(r.get("body")!=JSONObject.NULL)throw new AssertionError("304 body");
  String body="{\"data\":\""+"x".repeat(4096)+"\"}";
  r=call(args[0],"PUT","\"native-test\"",body,true);ok(r,200);if(!r.get("body").toString().contains("compressed-true"))throw new AssertionError(r.toString());
  r=call(args[0],"PUT","\"native-test\"",body,false);ok(r,200);if(!r.get("body").toString().contains("compressed-false"))throw new AssertionError(r.toString());
  r=call(args[0]+"/bad","GET","","",false);if(r.get("error")==null)throw new AssertionError("corrupt gzip accepted");
  r=call(args[0]+"/large","GET","","",false);if(r.get("error")==null||!r.get("error").toString().contains("20MB"))throw new AssertionError("decompression limit");
  System.out.println("PASS: native gzip download/upload, uncompressed compatibility, 304 empty body, corrupt gzip and decompression limit.");
 }finally{client.close();}}
}
