package com.plinthwell.roaamm.verification;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.plinthwell.roaamm.auth.ClientIp;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.passkey.PasskeyException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.UUID;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Simulated ID verification for members, and the scoped admin queue and audit log. */
@RestController
@RegisterReflectionForBinding({
    VerificationController.SubmitRequest.class, VerificationController.DecisionRequest.class,
    VerificationController.MyStatus.class, VerificationController.AdminRequestView.class,
    VerificationController.AuditView.class, VerificationService.Page.class
})
public class VerificationController {

    /** Only the document type. Any other field (a number, a photo) is ignored and never stored. */
    public record SubmitRequest(String docType) {}

    public record DecisionRequest(String decision, String reason) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MyStatus(String status, String docType, String sampleRef, String reason, Instant createdAt,
            Instant decidedAt, boolean simulated) {
        static MyStatus of(VerificationRepository.Request r) {
            return new MyStatus(r.status(), r.docType(), r.sampleRef(), r.reason(), r.createdAt(), r.decidedAt(),
                    true);
        }

        static final MyStatus NONE = new MyStatus("none", null, null, null, null, null, true);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AdminRequestView(UUID id, String userDisplayName, String userRole, String docType, String sampleRef,
            String status, String reason, Instant createdAt, Instant decidedAt, String decidedBy) {
        static AdminRequestView of(VerificationRepository.Request r) {
            return new AdminRequestView(r.id(), r.userDisplayName(), r.userRole(), r.docType(), r.sampleRef(),
                    r.status(), r.reason(), r.createdAt(), r.decidedAt(), r.decidedByName());
        }
    }

    public record AuditView(UUID id, String admin, String action, UUID targetId, Instant createdAt) {}

    private final VerificationService service;
    private final SessionService sessions;

    public VerificationController(VerificationService service, SessionService sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping("/v1/verification/me")
    public MyStatus mine(HttpServletRequest request) {
        return service.mine(current(request)).map(MyStatus::of).orElse(MyStatus.NONE);
    }

    @PostMapping("/v1/verification/requests")
    public MyStatus submit(@RequestBody SubmitRequest body, HttpServletRequest request) {
        return MyStatus.of(service.submit(current(request), body.docType(), ClientIp.of(request)));
    }

    @GetMapping("/v1/admin/verification")
    public VerificationService.Page<AdminRequestView> queue(@RequestParam(defaultValue = "pending") String status,
            @RequestParam(defaultValue = "0") int page, HttpServletRequest request) {
        var p = service.queue(current(request), status, page);
        return new VerificationService.Page<>(p.items().stream().map(AdminRequestView::of).toList(), p.page(),
                p.hasMore());
    }

    @GetMapping("/v1/admin/verification/{id}")
    public AdminRequestView detail(@PathVariable UUID id, HttpServletRequest request) {
        return AdminRequestView.of(service.detail(current(request), id));
    }

    @PostMapping("/v1/admin/verification/{id}/decision")
    public AdminRequestView decide(@PathVariable UUID id, @RequestBody DecisionRequest body,
            HttpServletRequest request) {
        return AdminRequestView.of(service.decide(current(request), id, body.decision(), body.reason()));
    }

    @GetMapping("/v1/admin/audit")
    public VerificationService.Page<AuditView> audit(@RequestParam(defaultValue = "0") int page,
            HttpServletRequest request) {
        var p = service.audit(current(request), page);
        return new VerificationService.Page<>(p.items().stream()
                .map(a -> new AuditView(a.id(), a.adminDisplayName(), a.action(), a.targetId(), a.createdAt()))
                .toList(), p.page(), p.hasMore());
    }

    private SessionService.Current current(HttpServletRequest request) {
        return sessions.currentSession(SessionCookie.read(request))
                .orElseThrow(() -> new PasskeyException(401, "unauthenticated"));
    }
}
