// ─────────────────────────────────────────────────────────────────────────────
// Jenkinsfile  —  FlexGate Go proxy CI pipeline
//
// Runs on every push / PR merge.
// Stages:
//   1. Checkout
//   2. Verify Toolchain
//   3. go vet
//   4. go test
//   5. go build  (linux/amd64)
//   6. Container image build (podman)
//   7. Push to registry  (main branch only, optional)
//
// Required Jenkins credentials:
//   registry-token   Secret text   npm token  (also used by Jenkinsfile.release)
//   container-registry-user    Username/password   podman registry login
//                              (optional — only needed if push is enabled)
//
// Required tools on agent:
//   go 1.22+, podman
// ─────────────────────────────────────────────────────────────────────────────

pipeline {
    agent any

    environment {
        BINARY      = 'flexgate-proxy'
        IMAGE       = 'localhost/flexgate-proxy'
        GO_VERSION  = '1.22'
    }

    options {
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    triggers {
        githubPush()
    }

    stages {

        // ── 1. Checkout ───────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                sh 'echo "Branch: ${GIT_BRANCH} | Commit: ${GIT_COMMIT}"'
            }
        }

        // ── 2. Verify Toolchain ───────────────────────────────────────────────
        stage('Verify Toolchain') {
            steps {
                sh '''
                    echo "=== Go ==="
                    go version
                    go env GOARCH GOOS CGO_ENABLED

                    echo "=== Podman ==="
                    podman --version || echo "(podman not installed — build stage will be skipped)"
                '''
            }
        }

        // ── 3. go vet ─────────────────────────────────────────────────────────
        stage('go vet') {
            steps {
                sh 'go vet ./...'
            }
        }

        // ── 4. go test ────────────────────────────────────────────────────────
        stage('go test') {
            steps {
                sh '''
                    go test \
                        -v \
                        -race \
                        -coverprofile=coverage.out \
                        -covermode=atomic \
                        ./...
                '''
            }
            post {
                always {
                    sh 'go tool cover -func=coverage.out | tail -1 || true'
                    archiveArtifacts allowEmptyArchive: true, artifacts: 'coverage.out'
                }
            }
        }

        // ── 5. go build ───────────────────────────────────────────────────────
        stage('go build') {
            steps {
                sh '''
                    mkdir -p dist/go
                    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
                    go build \
                        -trimpath \
                        -ldflags="-s -w -X main.version=${GIT_COMMIT:0:8}" \
                        -o dist/go/${BINARY} \
                        ./cmd/flexgate
                    echo "✅ Binary: $(ls -lh dist/go/${BINARY})"
                '''
            }
            post {
                success {
                    archiveArtifacts artifacts: "dist/go/${BINARY}", fingerprint: true
                }
            }
        }

        // ── 6. Container build ────────────────────────────────────────────────
        stage('Container Build') {
            when {
                expression { sh(script: 'command -v podman >/dev/null 2>&1 && echo yes || echo no', returnStdout: true).trim() == 'yes' }
            }
            steps {
                sh '''
                    podman build \
                        --build-arg VERSION=${GIT_COMMIT:0:8} \
                        -t ${IMAGE}:${GIT_COMMIT:0:8} \
                        -t ${IMAGE}:latest \
                        -f Containerfile \
                        .
                    echo "✅ Image built: ${IMAGE}:${GIT_COMMIT:0:8}"
                    podman image ls ${IMAGE}
                '''
            }
        }

        // ── 7. Push to registry (main branch only) ────────────────────────────
        // Skipped unless on main AND a CONTAINER_REGISTRY env var is set
        // in the Jenkins job configuration.
        stage('Push Image') {
            when {
                allOf {
                    anyOf {
                        branch 'main'
                        expression { env.GIT_BRANCH == 'origin/main' }
                    }
                    expression { env.CONTAINER_REGISTRY?.trim() }
                }
            }
            steps {
                sh '''
                    podman push ${IMAGE}:${GIT_COMMIT:0:8} ${CONTAINER_REGISTRY}/${BINARY}:${GIT_COMMIT:0:8}
                    podman push ${IMAGE}:latest           ${CONTAINER_REGISTRY}/${BINARY}:latest
                    echo "✅ Pushed to ${CONTAINER_REGISTRY}"
                '''
            }
        }
    }

    post {
        success {
            echo '✅ CI pipeline passed.'
        }
        failure {
            echo '❌ CI pipeline failed. Check the stage logs above.'
        }
        always {
            sh 'rm -f coverage.out'
            cleanWs()
        }
    }
}
