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
  CountDownLatch eventDone=new CountDownLatch(1);JSONObject[] event={null};client.request(args[0],"/api/events","GET","test-compression-token","\"native-test\"","",r2->{event[0]=r2;eventDone.countDown();});
  Thread.sleep(100);long start=System.nanoTime();r=call(args[0],"GET","","",false);ok(r,200);if(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)>1000)throw new AssertionError("notification blocked sync worker");
  if(!eventDone.await(5,TimeUnit.SECONDS))throw new AssertionError("event timeout");ok(event[0],304);
  CountDownLatch deltaDone=new CountDownLatch(1);JSONObject[] changed={null};client.request(args[0],"/api/changes","GET","test-compression-token","","",r2->{changed[0]=r2;deltaDone.countDown();});if(!deltaDone.await(5,TimeUnit.SECONDS))throw new AssertionError("delta timeout");ok(changed[0],200);
  CountDownLatch imageDone=new CountDownLatch(1);JSONObject[] image={null};client.request(args[0],"/api/images/"+"a".repeat(64),"GET","test-compression-token","","",r2->{image[0]=r2;imageDone.countDown();});if(!imageDone.await(5,TimeUnit.SECONDS))throw new AssertionError("image timeout");ok(image[0],200);
  System.out.println("PASS: native gzip download/upload, compatibility, 304 empty body, corrupt gzip/size limits, delta/image routes, notification worker does not block sync.");
 }finally{client.close();}}
}
