package com.plinthwell.roaamm.common;

import com.plinthwell.roaamm.auth.AuthProperties;
import com.plinthwell.roaamm.auth.ReadOnlyDemoInterceptor;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(AuthProperties.class)
public class WebConfig implements WebMvcConfigurer {

    private final ReadOnlyDemoInterceptor readOnlyDemo;

    public WebConfig(ReadOnlyDemoInterceptor readOnlyDemo) {
        this.readOnlyDemo = readOnlyDemo;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(readOnlyDemo).addPathPatterns("/v1/**");
    }

    @Bean
    static Clock clock() {
        return Clock.systemUTC();
    }
}
