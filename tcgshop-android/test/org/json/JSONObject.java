package org.json;
import java.util.*;
// Test-only JSON holder. Production uses Android's platform JSONObject.
public class JSONObject {
 public static final Object NULL=new Object();private final Map<String,Object> values=new HashMap<>();private String raw;
 public JSONObject(){}public JSONObject(String text){if(!text.trim().startsWith("{"))throw new IllegalArgumentException("invalid JSON");raw=text;}
 public JSONObject put(String k,Object v){values.put(k,v);return this;}public Object get(String k){return values.get(k);}public String toString(){return raw!=null?raw:values.toString();}
}
