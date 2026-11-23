package com.plinthwell.roaamm.passkey;

import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.RegexPatternTypeFilter;
import org.springframework.util.ClassUtils;

/**
 * webauthn4j reads and writes its data classes (client data JSON, CBOR
 * attestation objects, COSE keys) with Jackson through reflection, and ships
 * no native-image metadata. Registers every webauthn4j type found at AOT
 * build time so the native image can do the same.
 */
public class WebAuthnRuntimeHints implements RuntimeHintsRegistrar {

    static final String PACKAGE = "com.webauthn4j";

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        var scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
                return true; // interfaces, abstract classes and enums too
            }
        };
        scanner.setResourceLoader(new org.springframework.core.io.DefaultResourceLoader(classLoader));
        scanner.addIncludeFilter(new RegexPatternTypeFilter(java.util.regex.Pattern.compile(".*")));
        for (var candidate : scanner.findCandidateComponents(PACKAGE)) {
            String name = candidate.getBeanClassName();
            if (name == null || !ClassUtils.isPresent(name, classLoader)) {
                continue;
            }
            hints.reflection().registerType(ClassUtils.resolveClassName(name, classLoader),
                    MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                    MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                    MemberCategory.INVOKE_DECLARED_METHODS,
                    MemberCategory.INVOKE_PUBLIC_METHODS,
                    MemberCategory.ACCESS_DECLARED_FIELDS);
        }
    }
}
